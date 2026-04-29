"""
Point Cloud Preprocessor Service.
Handles voxel downsampling, outlier removal, normal-variance filtering,
and data cleaning.
"""
import numpy as np
import logging

logger = logging.getLogger(__name__)

# Maximum angular standard deviation (degrees) of neighbourhood normals
# before a point is considered a high-curvature artefact.
NORMAL_VARIANCE_THRESHOLD_DEG = 25.0


class Preprocessor:
    """Downsample, denoise, and prepare point cloud for structural analysis."""

    def __init__(self, voxel_size: float = 0.1, outlier_std: float = 2.0):
        self.voxel_size = voxel_size
        self.outlier_std = outlier_std

    def preprocess(self, points: np.ndarray, bolt_mask: np.ndarray | None = None) -> np.ndarray:
        """
        Full preprocessing pipeline:
        0. Apply DeepBolt rock bolt mask (if provided)
        1. Remove NaN values
        2. Voxel downsampling (done first for speed)
        3. Statistical outlier removal (always runs; adapts neighbours for large clouds)
        4. Normal-variance high-curvature filter

        Args:
            points: Array of shape (N, 3)
            bolt_mask: Array of shape (N,) containing 1 for points to remove, 0 otherwise.

        Returns:
            Cleaned, downsampled points array
        """
        logger.info(f"Starting preprocessing on {len(points)} points")

        # 0. Apply deepbolt mask if provided
        if bolt_mask is not None:
            # Mask contains 1 where bolt is found
            keep_mask = (bolt_mask != 1)
            points = points[keep_mask]
            removed_bolts = np.sum(~keep_mask)
            logger.info(f"Removed {removed_bolts} rock bolt points based on bolt_mask")

        # 1. Remove NaN
        nan_mask = ~np.isnan(points).any(axis=1)
        points = points[nan_mask]
        if np.sum(~nan_mask) > 0:
            logger.info(f"Removed {np.sum(~nan_mask)} NaN points")

        # 2. Voxel downsampling FIRST to drastically reduce amount of data
        points = self.downsample(points)

        # 3. Outlier removal — always run, but use fewer neighbours for very large clouds
        points = self.remove_outliers(points)

        # 4. Normal-variance high-curvature filter
        points = self.filter_high_curvature(points)

        logger.info(f"Preprocessing complete: {len(points)} points remaining")
        return points

    def downsample(self, points: np.ndarray) -> np.ndarray:
        """
        Voxel grid downsampling using Open3D.

        Args:
            points: Array of shape (N, 3)

        Returns:
            Downsampled points
        """
        original_count = len(points)
        logger.info(f"Downsampling with voxel size {self.voxel_size}m")

        try:
            import open3d as o3d
            pcd = o3d.geometry.PointCloud()
            pcd.points = o3d.utility.Vector3dVector(points)
            pcd_down = pcd.voxel_down_sample(self.voxel_size)
            points_down = np.asarray(pcd_down.points)
        except ImportError:
            # Fallback: grid-based downsampling
            logger.warning("Open3D not available, using numpy-based downsampling")
            points_down = self._numpy_voxel_downsample(points)

        ratio = 100 * len(points_down) / max(1, original_count)
        logger.info(f"Downsampled: {original_count} → {len(points_down)} points ({ratio:.1f}%)")
        return points_down

    def remove_outliers(self, points: np.ndarray) -> np.ndarray:
        """
        Statistical outlier removal.
        Adapts nb_neighbors for large clouds (>=500k) instead of skipping.

        Args:
            points: Array of shape (N, 3)

        Returns:
            Filtered points
        """
        original_count = len(points)

        # Use fewer neighbours for very large clouds to keep SOR tractable
        nb_neighbors = 10 if len(points) >= 500_000 else 20
        logger.info(
            f"Removing outliers (>{self.outlier_std}σ, nb_neighbors={nb_neighbors}, "
            f"n={len(points)})"
        )

        try:
            import open3d as o3d
            pcd = o3d.geometry.PointCloud()
            pcd.points = o3d.utility.Vector3dVector(points)
            pcd_clean, inlier_idx = pcd.remove_statistical_outlier(
                nb_neighbors=nb_neighbors,
                std_ratio=self.outlier_std
            )
            points_clean = np.asarray(pcd_clean.points)
        except ImportError:
            # Fallback: scipy-based outlier removal
            logger.warning("Open3D not available, using scipy-based outlier removal")
            points_clean = self._scipy_outlier_removal(points)

        removed = original_count - len(points_clean)
        logger.info(f"Removed {removed} outliers ({100*removed/max(1,original_count):.1f}%)")
        return points_clean

    def filter_high_curvature(self, points: np.ndarray) -> np.ndarray:
        """
        Remove points whose local neighbourhood exhibits high normal variance,
        indicating high-curvature artefacts (blast damage, rebar stubs, etc.).

        Steps:
            1. Estimate normals via Open3D KDTree (radius=0.3, max_nn=30)
            2. Compute angular std deviation of normals per point neighbourhood
            3. Remove points where deviation exceeds NORMAL_VARIANCE_THRESHOLD_DEG
            4. Guardrail: if removal >30%, relax threshold by 5° increments until ≤30%
            5. Log points removed

        Args:
            points: Array of shape (N, 3)

        Returns:
            Filtered points array
        """
        original_count = len(points)
        if original_count < 50:
            return points

        try:
            import open3d as o3d

            pcd = o3d.geometry.PointCloud()
            pcd.points = o3d.utility.Vector3dVector(points)
            pcd.estimate_normals(
                search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.3, max_nn=30)
            )

            normals = np.asarray(pcd.normals)
            kdtree = o3d.geometry.KDTreeFlann(pcd)

            # Compute per-point angular std deviation of neighbourhood normals
            angular_std = np.zeros(len(points))
            for i in range(len(points)):
                [k, idx, _] = kdtree.search_hybrid_vector_3d(points[i], radius=0.3, max_nn=30)
                if k < 3:
                    angular_std[i] = 0.0
                    continue
                nb_normals = normals[idx]
                # Mean normal
                mean_n = np.mean(nb_normals, axis=0)
                mean_mag = np.linalg.norm(mean_n)
                if mean_mag < 1e-10:
                    angular_std[i] = 90.0  # degenerate — mark for removal
                    continue
                mean_n = mean_n / mean_mag
                # Angular deviations
                cos_angles = np.clip(np.dot(nb_normals, mean_n), -1.0, 1.0)
                angles_deg = np.degrees(np.arccos(np.abs(cos_angles)))
                angular_std[i] = np.std(angles_deg)

            # Apply threshold with guardrail
            threshold = NORMAL_VARIANCE_THRESHOLD_DEG
            keep_mask = angular_std <= threshold
            removal_pct = 100.0 * (1.0 - np.sum(keep_mask) / max(1, len(points)))

            while removal_pct > 30.0 and threshold < 90.0:
                threshold += 5.0
                keep_mask = angular_std <= threshold
                removal_pct = 100.0 * (1.0 - np.sum(keep_mask) / max(1, len(points)))
                logger.info(
                    f"Normal-variance guardrail: relaxed threshold to {threshold}° "
                    f"(removal now {removal_pct:.1f}%)"
                )

            points_filtered = points[keep_mask]
            removed = original_count - len(points_filtered)
            logger.info(
                f"Normal-variance filter removed {removed} high-curvature points "
                f"({100*removed/max(1,original_count):.1f}%, threshold={threshold}°)"
            )
            return points_filtered

        except ImportError:
            logger.warning(
                "Open3D not available — skipping normal-variance filter, "
                "returning input unchanged"
            )
            return points
        except Exception as e:
            logger.warning(f"Normal-variance filter failed ({e}), returning input unchanged")
            return points

    def _numpy_voxel_downsample(self, points: np.ndarray) -> np.ndarray:
        """Vectorized voxel downsampling using numpy (much faster than dictionary loops)."""
        if len(points) == 0:
            return points

        # Shift to positive space and calculate voxel coordinates as a single integer
        # This allows us to use np.unique which is highly optimized
        mins = points.min(axis=0)
        maxs = points.max(axis=0)
        
        # Calculate grid dimensions
        dims = ((maxs - mins) / self.voxel_size).astype(np.int64) + 1
        
        # Voxel indices
        v_idx = ((points - mins) / self.voxel_size).astype(np.int64)
        
        # Convert 3D indices to 1D keys for np.unique
        # key = z * (dx * dy) + y * dx + x
        keys = v_idx[:, 0] + v_idx[:, 1] * dims[0] + v_idx[:, 2] * (dims[0] * dims[1])
        
        # Get unique keys and their first occurrences
        _, unique_indices = np.unique(keys, return_index=True)
        
        # For even better quality, we could average points in voxels, 
        # but taking the first point is near-instantaneous and usually sufficient.
        return points[unique_indices]

    def _scipy_outlier_removal(self, points: np.ndarray) -> np.ndarray:
        """Fallback outlier removal using scipy KDTree."""
        from scipy.spatial import cKDTree

        tree = cKDTree(points)
        dists, _ = tree.query(points, k=21)  # 20 neighbors + self
        mean_dists = dists[:, 1:].mean(axis=1)

        threshold = np.mean(mean_dists) + self.outlier_std * np.std(mean_dists)
        inlier_mask = mean_dists < threshold

        return points[inlier_mask]
