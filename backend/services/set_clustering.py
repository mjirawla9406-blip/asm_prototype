"""
Discontinuity Set Clustering Service.
Groups detected planes into structural discontinuity sets
using cyclic orientation transformation and Agglomerative Clustering.
"""
import numpy as np
import logging
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)

# Color palette for up to 8 discontinuity sets
SET_COLORS = [
    "#FF4444",  # Red - Set 1
    "#4488FF",  # Blue - Set 2
    "#44DD44",  # Green - Set 3
    "#FFCC00",  # Yellow - Set 4
    "#CC44FF",  # Purple - Set 5
    "#FF8800",  # Orange - Set 6
    "#00CCCC",  # Cyan - Set 7 (overflow)
    "#FF44AA",  # Pink - Set 8 (overflow)
]

SET_NAMES = [
    "Set 1 (Primary)",
    "Set 2 (Secondary)",
    "Set 3 (Tertiary)",
    "Set 4 (Quaternary)",
    "Set 5 (Quinary)",
    "Set 6 (Senary)",
    "Set 7",
    "Set 8",
]


class SetClusterer:
    """Cluster detected planes into discontinuity sets based on orientation similarity."""

    def __init__(self, eps: float = 0.15, min_samples: int = 2, max_sets: int = 6):
        """
        Args:
            eps: DBSCAN epsilon (angular distance in radians) — used only for fallback
            min_samples: Minimum planes per cluster
            max_sets: Maximum number of discontinuity sets (retained for API compat, not enforced)
        """
        self.eps = eps
        self.min_samples = min_samples
        self.max_sets = max_sets

    # ------------------------------------------------------------------ #
    # Cyclic transformation helpers
    # ------------------------------------------------------------------ #

    @staticmethod
    def cyclic_transform(dip: float, dip_dir: float) -> Tuple[float, float, float]:
        """
        Convert (dip, dip_direction) to a Cartesian unit vector that lives
        on the unit sphere. This eliminates the angular wrap-around problem:
        orientations at 358° and 2° map to nearby Cartesian points, so
        Euclidean distance in this space faithfully represents angular
        proximity.  Without this transform, 358° and 2° would appear
        356° apart when differenced naively.

        Args:
            dip: Dip angle in degrees
            dip_dir: Dip direction in degrees

        Returns:
            (x, y, z) unit-vector coordinates
        """
        dd_rad = np.radians(dip_dir)
        d_rad = np.radians(dip)
        x = np.sin(d_rad) * np.sin(dd_rad)
        y = np.sin(d_rad) * np.cos(dd_rad)
        z = np.cos(d_rad)
        return x, y, z

    @staticmethod
    def normals_to_orientations(normals: np.ndarray) -> List[Dict[str, float]]:
        """
        Convert an array of unit normal vectors to (dip, dip_direction) pairs.

        Args:
            normals: Array of shape (N, 3), unit normal vectors

        Returns:
            List of dicts with 'dip' and 'dip_direction' keys
        """
        from services.orientation_calculator import OrientationCalculator

        orientations = []
        for n in normals:
            ori = OrientationCalculator.normal_to_orientation(n)
            orientations.append(ori)
        return orientations

    # ------------------------------------------------------------------ #
    # Main clustering entry point
    # ------------------------------------------------------------------ #

    def cluster_planes(self, planes: List[Dict]) -> Tuple[np.ndarray, List[Dict]]:
        """
        Cluster planes into discontinuity sets.

        Args:
            planes: List of plane dicts with 'normal' key

        Returns:
            Tuple of:
              - labels: array of cluster labels per plane
              - set_info: list of discontinuity set metadata dicts
        """
        if len(planes) < 2:
            labels = np.zeros(len(planes), dtype=int)
            set_info = self._build_set_info(planes, labels)
            return labels, set_info

        logger.info(f"Clustering {len(planes)} planes with AgglomerativeClustering")

        # Extract and normalise normals
        normals = np.array([p['normal'] for p in planes])
        for i in range(len(normals)):
            mag = np.linalg.norm(normals[i])
            if mag > 0:
                normals[i] = normals[i] / mag
            # Ensure consistent hemisphere (upper hemisphere)
            if normals[i][2] < 0:
                normals[i] = -normals[i]

        # Convert normals → orientations → cyclic Cartesian features
        orientations = self.normals_to_orientations(normals)
        features = np.array([
            self.cyclic_transform(o['dip'], o['dip_direction'])
            for o in orientations
        ])  # shape (N, 3)

        # Standardise features before clustering
        from sklearn.preprocessing import StandardScaler
        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(features)

        # Primary path: AgglomerativeClustering with automatic set count
        try:
            from sklearn.cluster import AgglomerativeClustering

            clustering = AgglomerativeClustering(
                n_clusters=None,
                distance_threshold=0.3,
                linkage='ward',
            )
            labels = clustering.fit_predict(features_scaled)

        except ImportError:
            # Fallback: DBSCAN on precomputed angular distance matrix
            logger.warning("AgglomerativeClustering unavailable, falling back to DBSCAN")
            try:
                from sklearn.cluster import DBSCAN

                distance_matrix = self._compute_angular_distance_matrix(normals)
                clustering = DBSCAN(
                    eps=self.eps,
                    min_samples=self.min_samples,
                    metric='precomputed',
                ).fit(distance_matrix)
                labels = clustering.labels_
            except ImportError:
                logger.warning("scikit-learn not available, using simple clustering")
                labels = self._simple_clustering(normals)

        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        n_noise = np.sum(labels == -1)

        # NOTE: No _merge_clusters() call — number of joint sets is determined
        # automatically by the distance_threshold parameter.

        # Assign noise points to nearest cluster
        if n_noise > 0 and n_clusters > 0:
            labels = self._assign_noise(normals, labels)

        # Re-index labels to be contiguous starting from 0
        unique_labels = sorted(set(labels))
        if -1 in unique_labels:
            unique_labels.remove(-1)
        label_map = {old: new for new, old in enumerate(unique_labels)}
        label_map[-1] = -1
        labels = np.array([label_map[l] for l in labels])

        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        logger.info(f"Found {n_clusters} discontinuity sets, {np.sum(labels == -1)} noise planes")

        # Build set info
        set_info = self._build_set_info(planes, labels)

        return labels, set_info

    # ------------------------------------------------------------------ #
    # Distance / fallback helpers (kept for DBSCAN fallback path)
    # ------------------------------------------------------------------ #

    def _compute_angular_distance_matrix(self, normals: np.ndarray) -> np.ndarray:
        """Compute pairwise angular distances between normal vectors."""
        n = len(normals)
        dist_matrix = np.zeros((n, n))

        for i in range(n):
            for j in range(i + 1, n):
                cos_angle = np.clip(np.dot(normals[i], normals[j]), -1.0, 1.0)
                # Use minimum angle (accounting for antiparallel normals)
                angle = np.arccos(abs(cos_angle))
                dist_matrix[i, j] = angle
                dist_matrix[j, i] = angle

        return dist_matrix

    def _simple_clustering(self, normals: np.ndarray) -> np.ndarray:
        """Fallback simple agglomerative clustering."""
        from scipy.cluster.hierarchy import fcluster, linkage
        from scipy.spatial.distance import squareform

        dist_matrix = self._compute_angular_distance_matrix(normals)
        condensed = squareform(dist_matrix)

        if len(condensed) == 0:
            return np.zeros(len(normals), dtype=int)

        Z = linkage(condensed, method='average')
        labels = fcluster(Z, t=self.eps, criterion='distance') - 1

        return labels

    def _merge_clusters(
        self, normals: np.ndarray, labels: np.ndarray, max_clusters: int
    ) -> np.ndarray:
        """Merge similar clusters until max_clusters is reached.
        Retained for backward compatibility but no longer called in the main path."""
        unique = [l for l in set(labels) if l >= 0]

        while len(unique) > max_clusters:
            # Compute mean normals for each cluster
            means = {}
            for l in unique:
                mask = labels == l
                means[l] = np.mean(normals[mask], axis=0)
                mag = np.linalg.norm(means[l])
                if mag > 0:
                    means[l] /= mag

            # Find closest pair
            min_dist = float('inf')
            merge_pair = (unique[0], unique[1])
            for i, l1 in enumerate(unique):
                for l2 in unique[i+1:]:
                    cos_a = abs(np.dot(means[l1], means[l2]))
                    dist = np.arccos(np.clip(cos_a, -1, 1))
                    if dist < min_dist:
                        min_dist = dist
                        merge_pair = (l1, l2)

            # Merge
            labels[labels == merge_pair[1]] = merge_pair[0]
            unique.remove(merge_pair[1])

        return labels

    # ------------------------------------------------------------------ #
    # Noise assignment
    # ------------------------------------------------------------------ #

    def _assign_noise(self, normals: np.ndarray, labels: np.ndarray) -> np.ndarray:
        """Assign noise points to the nearest cluster."""
        cluster_labels = [l for l in set(labels) if l >= 0]
        if not cluster_labels:
            return labels

        # Compute cluster mean normals
        means = {}
        for l in cluster_labels:
            mask = labels == l
            m = np.mean(normals[mask], axis=0)
            mag = np.linalg.norm(m)
            if mag > 0:
                means[l] = m / mag
            else:
                means[l] = m

        # Assign each noise point to nearest cluster
        noise_mask = labels == -1
        for i in np.where(noise_mask)[0]:
            min_dist = float('inf')
            best_label = cluster_labels[0]
            for l, mean_n in means.items():
                cos_a = abs(np.dot(normals[i], mean_n))
                dist = np.arccos(np.clip(cos_a, -1, 1))
                if dist < min_dist:
                    min_dist = dist
                    best_label = l
            labels[i] = best_label

        return labels

    # ------------------------------------------------------------------ #
    # Set info builder
    # ------------------------------------------------------------------ #

    def _build_set_info(self, planes: List[Dict], labels: np.ndarray) -> List[Dict]:
        """Build discontinuity set metadata."""
        from services.orientation_calculator import OrientationCalculator

        unique_labels = sorted(set(labels))
        if -1 in unique_labels:
            unique_labels.remove(-1)

        set_info = []
        for set_idx, label in enumerate(unique_labels):
            mask = labels == label
            set_planes = [p for p, m in zip(planes, mask) if m]

            normals = [np.array(p['normal']) for p in set_planes]
            mean_orientation = OrientationCalculator.compute_mean_orientation(normals)

            total_points = sum(p.get('num_points', 0) for p in set_planes)
            color = SET_COLORS[set_idx % len(SET_COLORS)]

            set_data = {
                'set_id': set_idx,
                'name': SET_NAMES[set_idx % len(SET_NAMES)],
                'color': color,
                'num_planes': len(set_planes),
                'mean_dip': mean_orientation['dip'],
                'mean_dip_direction': mean_orientation['dip_direction'],
                'mean_strike': mean_orientation['strike'],
                'std_dip': 0.0,
                'std_dip_direction': 0.0,
                'total_points': total_points,
            }

            # Compute standard deviations
            if len(set_planes) > 1:
                dips = [OrientationCalculator.normal_to_orientation(p['normal'])['dip']
                        for p in set_planes]
                dd = [OrientationCalculator.normal_to_orientation(p['normal'])['dip_direction']
                      for p in set_planes]
                set_data['std_dip'] = round(float(np.std(dips)), 2)
                set_data['std_dip_direction'] = round(float(np.std(dd)), 2)

            set_info.append(set_data)

        return set_info
