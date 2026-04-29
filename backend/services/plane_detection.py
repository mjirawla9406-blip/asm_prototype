"""
Plane Detection Service.
Uses iterative RANSAC followed by planar-patch refinement
to detect discontinuity planes in point clouds.
"""
import numpy as np
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


class PlaneDetector:
    """Detect structural discontinuity planes using RANSAC + planar-patch segmentation."""

    def __init__(
        self,
        distance_threshold: float = 0.05,
        ransac_n: int = 3,
        num_iterations: int = 1000,
        min_inliers: int = 50
    ):
        self.distance_threshold = distance_threshold
        self.ransac_n = ransac_n
        self.num_iterations = num_iterations
        self.min_inliers = min_inliers

    def detect_planes(
        self,
        points: np.ndarray,
        max_planes: int = 30
    ) -> List[Dict]:
        """
        Detect dominant planes iteratively using RANSAC.
        After each plane is found, its inlier points are removed
        and detection continues on the remaining points.

        Args:
            points: Array of shape (N, 3)
            max_planes: Maximum number of planes to detect

        Returns:
            List of plane dicts with keys:
              - 'id': plane index
              - 'normal': plane normal vector (3,)
              - 'offset': plane equation offset d
              - 'inlier_indices': original indices of inlier points
              - 'inlier_points': actual coordinates of inlier points
              - 'centroid': centroid of inlier points
              - 'area': estimated area of the plane region
              - 'num_points': count of inliers
              - 'confidence': detection confidence score
        """
        logger.info(f"Starting RANSAC plane detection (max {max_planes} planes)")

        try:
            return self._detect_with_open3d(points, max_planes)
        except ImportError:
            logger.warning("Open3D not available, using numpy RANSAC")
            return self._detect_with_numpy(points, max_planes)

    def _detect_with_open3d(self, points: np.ndarray, max_planes: int) -> List[Dict]:
        """Detect planes using Open3D's optimized RANSAC + planar-patch second pass."""
        import open3d as o3d

        all_planes = []
        remaining_indices = np.arange(len(points))
        remaining_points = points.copy()

        # ============================================================
        # Pass 1: Iterative RANSAC (existing, unchanged)
        # ============================================================
        for plane_idx in range(max_planes):
            if len(remaining_points) < self.min_inliers:
                logger.info(f"Too few remaining points ({len(remaining_points)}), stopping")
                break

            # Fast RANSAC: If there's a huge amount of points, randomly subsample 
            # them JUST for the plane fitting. This drastically speeds up iteration.
            work_points = remaining_points
            if len(remaining_points) > 50000:
                sub_idx = np.random.choice(len(remaining_points), 50000, replace=False)
                work_points = remaining_points[sub_idx]

            pcd = o3d.geometry.PointCloud()
            pcd.points = o3d.utility.Vector3dVector(work_points)

            try:
                plane_model, _ = pcd.segment_plane(
                    distance_threshold=self.distance_threshold,
                    ransac_n=self.ransac_n,
                    num_iterations=self.num_iterations
                )
            except Exception as e:
                logger.warning(f"RANSAC failed at plane {plane_idx + 1}: {e}")
                break

            # Find all inliers across the ENTIRE remaining points set
            dists = np.abs(np.dot(remaining_points, plane_model[:3]) + plane_model[3])
            inliers = np.where(dists <= self.distance_threshold)[0]

            if len(inliers) < self.min_inliers:
                logger.info(f"Plane {plane_idx + 1}: only {len(inliers)} inliers, stopping")
                break

            # Extract plane data
            a, b, c, d = plane_model
            normal = np.array([a, b, c])
            normal_mag = np.linalg.norm(normal)
            if normal_mag > 0:
                normal = normal / normal_mag

            inlier_points = remaining_points[inliers]
            original_indices = remaining_indices[inliers]
            centroid = np.mean(inlier_points, axis=0)

            # Estimate area using convex hull projection
            area = self._estimate_plane_area(inlier_points, normal)

            # Confidence based on inlier ratio and fit quality
            confidence = min(1.0, len(inliers) / max(100, len(remaining_points) * 0.1))

            plane_data = {
                'id': plane_idx,
                'normal': normal.tolist(),
                'offset': float(d),
                'inlier_indices': original_indices.tolist(),
                'inlier_points': inlier_points.tolist(),
                'centroid': centroid.tolist(),
                'area': float(area),
                'num_points': len(inliers),
                'confidence': round(float(confidence), 3),
            }
            all_planes.append(plane_data)

            pct = 100 * len(inliers) / len(points)
            logger.info(
                f"Plane {plane_idx + 1}: {len(inliers)} inliers ({pct:.1f}%), "
                f"normal=[{normal[0]:.3f}, {normal[1]:.3f}, {normal[2]:.3f}], "
                f"area={area:.2f}m²"
            )

            # Remove inliers from remaining
            mask = np.ones(len(remaining_points), dtype=bool)
            mask[inliers] = False
            remaining_points = remaining_points[mask]
            remaining_indices = remaining_indices[mask]

        ransac_count = len(all_planes)
        logger.info(f"RANSAC pass detected {ransac_count} planes")

        # ============================================================
        # Pass 2: Planar-patch refinement on leftover points
        # ============================================================
        try:
            if len(remaining_points) >= self.min_inliers:
                rest_pcd = o3d.geometry.PointCloud()
                rest_pcd.points = o3d.utility.Vector3dVector(remaining_points)
                rest_pcd.estimate_normals(
                    search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.3, max_nn=30)
                )

                patches = rest_pcd.detect_planar_patches(
                    normal_variance_threshold_deg=25,
                    coplanarity_deg=75,
                    outlier_ratio=0.75,
                    min_plane_edge_length=0.5,
                )

                patch_planes = []
                for patch in patches:
                    try:
                        # Extract plane model from the OrientedBoundingBox
                        center = np.asarray(patch.center)
                        R = np.asarray(patch.R)
                        # The normal of the planar patch is the third column of the rotation matrix
                        patch_normal = R[:, 2].copy()
                        patch_normal_mag = np.linalg.norm(patch_normal)
                        if patch_normal_mag > 0:
                            patch_normal = patch_normal / patch_normal_mag

                        # Find inlier points: points close to the patch plane
                        d_offset = -np.dot(patch_normal, center)
                        dists = np.abs(np.dot(remaining_points, patch_normal) + d_offset)
                        patch_inliers = np.where(dists <= self.distance_threshold * 2)[0]

                        # Also restrict to points within the bounding box extent
                        extent = np.asarray(patch.extent)
                        local_pts = remaining_points[patch_inliers] - center
                        local_coords = local_pts @ R  # project onto local axes
                        within = (
                            (np.abs(local_coords[:, 0]) <= extent[0] / 2 + self.distance_threshold) &
                            (np.abs(local_coords[:, 1]) <= extent[1] / 2 + self.distance_threshold) &
                            (np.abs(local_coords[:, 2]) <= extent[2] / 2 + self.distance_threshold)
                        )
                        patch_inliers = patch_inliers[within]

                        if len(patch_inliers) < self.min_inliers:
                            continue

                        inlier_pts = remaining_points[patch_inliers]
                        orig_idx = remaining_indices[patch_inliers]
                        centroid = np.mean(inlier_pts, axis=0)
                        area = self._estimate_plane_area(inlier_pts, patch_normal)

                        patch_planes.append({
                            'id': -1,  # will be re-assigned
                            'normal': patch_normal.tolist(),
                            'offset': float(d_offset),
                            'inlier_indices': orig_idx.tolist(),
                            'inlier_points': inlier_pts.tolist(),
                            'centroid': centroid.tolist(),
                            'area': float(area),
                            'num_points': len(patch_inliers),
                            'confidence': 0.75,
                        })
                    except Exception as patch_err:
                        logger.debug(f"Skipping patch: {patch_err}")
                        continue

                logger.info(f"Planar-patch pass found {len(patch_planes)} candidate planes")

                # Deduplicate: keep plane with more inliers when normal < 5°
                # AND centroid < 2m apart
                for pp in patch_planes:
                    duplicate = False
                    pp_normal = np.array(pp['normal'])
                    pp_centroid = np.array(pp['centroid'])
                    for existing in all_planes:
                        ex_normal = np.array(existing['normal'])
                        ex_centroid = np.array(existing['centroid'])
                        cos_angle = np.clip(abs(np.dot(pp_normal, ex_normal)), -1.0, 1.0)
                        angle_deg = np.degrees(np.arccos(cos_angle))
                        dist = np.linalg.norm(pp_centroid - ex_centroid)
                        if angle_deg < 5.0 and dist < 2.0:
                            # Keep whichever has more inliers
                            if pp['num_points'] > existing['num_points']:
                                existing.update(pp)
                            duplicate = True
                            break
                    if not duplicate:
                        all_planes.append(pp)

        except Exception as e:
            logger.warning(f"Planar-patch second pass failed ({e}), continuing with RANSAC results only")

        # Assign sequential IDs to all merged planes
        for idx, plane in enumerate(all_planes):
            plane['id'] = idx

        logger.info(f"Detected {len(all_planes)} planes total (RANSAC: {ransac_count}, patches: {len(all_planes) - ransac_count})")
        return all_planes

    def _detect_with_numpy(self, points: np.ndarray, max_planes: int) -> List[Dict]:
        """Highly optimized RANSAC discovery for large point clouds without Open3D."""
        all_planes = []
        remaining_mask = np.ones(len(points), dtype=bool)
        
        # Determine discovery subset size (speed vs recall tradeoff)
        discovery_size = min(len(points), 50000)
        discovery_idx = np.random.choice(len(points), discovery_size, replace=False)
        discovery_points = points[discovery_idx]

        for plane_idx in range(max_planes):
            available_global = np.where(remaining_mask)[0]
            if len(available_global) < self.min_inliers:
                break

            # Project remaining mask to discovery points to see what's still available for searching
            mask_at_discovery = remaining_mask[discovery_idx]
            available_discovery = np.where(mask_at_discovery)[0]
            
            if len(available_discovery) < 30: # Too few points in search subset
                break

            best_inliers_count = -1
            best_model = None
            
            # Fast iteration on discovery subset
            # Using 500 iterations is usually sufficient for 3D point cloud planes
            for iter_idx in range(500):
                sample_idx = np.random.choice(available_discovery, size=3, replace=False)
                sample_pts = discovery_points[sample_idx]

                # Fit plane
                v1 = sample_pts[1] - sample_pts[0]
                v2 = sample_pts[2] - sample_pts[0]
                normal = np.cross(v1, v2)
                norm_mag = np.linalg.norm(normal)
                if norm_mag < 1e-8: continue
                normal = normal / norm_mag
                d = -np.dot(normal, sample_pts[0])

                # Quick check on discovery points
                test_points = discovery_points[available_discovery]
                distances = np.abs(np.dot(test_points, normal) + d)
                n_inliers = np.sum(distances < self.distance_threshold)

                if n_inliers > best_inliers_count:
                    best_inliers_count = n_inliers
                    best_model = (normal, d)
                    
                    # Early exit if we found a very strong plane
                    if n_inliers > len(available_discovery) * 0.2:
                        break

            if best_model is None: break

            # Stage 2: Final inlier count on ALL global points
            normal, d = best_model
            distances = np.abs(np.dot(points[available_global], normal) + d)
            inlier_mask = distances < self.distance_threshold
            best_inliers = available_global[inlier_mask]

            if len(best_inliers) < self.min_inliers:
                continue

            inlier_points = points[best_inliers]
            centroid = np.mean(inlier_points, axis=0)
            area = self._estimate_plane_area(inlier_points, normal)
            confidence = min(1.0, len(best_inliers) / max(100, np.sum(remaining_mask) * 0.1))

            all_planes.append({
                'id': plane_idx,
                'normal': normal.tolist(),
                'offset': float(d),
                'inlier_indices': best_inliers.tolist(),
                'inlier_points': inlier_points.tolist(),
                'centroid': centroid.tolist(),
                'area': float(area),
                'num_points': len(best_inliers),
                'confidence': round(float(confidence), 3),
            })

            remaining_mask[best_inliers] = False

        logger.info(f"Detected {len(all_planes)} planes (optimized numpy fallback)")
        return all_planes

    def _estimate_plane_area(self, inlier_points: np.ndarray, normal: np.ndarray) -> float:
        """
        Estimate the area of a plane region by projecting points onto the plane
        and computing the convex hull area.
        """
        if len(inlier_points) < 3:
            return 0.0

        try:
            # Create local 2D coordinate system on the plane
            if abs(normal[2]) < 0.9:
                u = np.cross(normal, [0, 0, 1])
            else:
                u = np.cross(normal, [1, 0, 0])
            u = u / np.linalg.norm(u)
            v = np.cross(normal, u)

            centroid = np.mean(inlier_points, axis=0)
            local_pts = inlier_points - centroid
            coords_2d = np.column_stack([
                np.dot(local_pts, u),
                np.dot(local_pts, v)
            ])

            from scipy.spatial import ConvexHull
            hull = ConvexHull(coords_2d)
            return float(hull.volume)  # In 2D, volume = area
        except Exception:
            # Fallback: bounding box area
            ptp = np.ptp(inlier_points, axis=0)
            sorted_dims = np.sort(ptp)[::-1]
            return float(sorted_dims[0] * sorted_dims[1])

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger.info("Generating test point cloud...")
    
    # Generate random points
    np.random.seed(42)
    random_points = np.random.rand(1000, 3) * 10
    
    # Generate points on a distinct plane (z=5)
    plane_xy = np.random.rand(500, 2) * 10
    plane_z = np.full((500, 1), 5.0)
    plane_points = np.hstack((plane_xy, plane_z))
    
    # Combine points
    test_points = np.vstack((random_points, plane_points))
    
    detector = PlaneDetector(distance_threshold=0.1, min_inliers=100)
    planes = detector.detect_planes(test_points)
    
    logger.info(f"Found {len(planes)} planes.")
    for p in planes:
        logger.info(f"Plane {p['id']}: Normal={p['normal']}, Offset={p['offset']:.2f}, Inliers={p['num_points']}")
