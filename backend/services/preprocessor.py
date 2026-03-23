"""
Point Cloud Preprocessor Service.
Handles voxel downsampling, outlier removal, and data cleaning.
"""
import numpy as np
import logging

logger = logging.getLogger(__name__)


class Preprocessor:
    """Downsample, denoise, and prepare point cloud for structural analysis."""

    def __init__(self, voxel_size: float = 0.1, outlier_std: float = 2.0):
        self.voxel_size = voxel_size
        self.outlier_std = outlier_std

    def preprocess(self, points: np.ndarray) -> np.ndarray:
        """
        Full preprocessing pipeline:
        1. Remove NaN values
        2. Voxel downsampling (done first for speed)
        3. Statistical outlier removal (skipped if too large)

        Args:
            points: Array of shape (N, 3)

        Returns:
            Cleaned, downsampled points array
        """
        logger.info(f"Starting preprocessing on {len(points)} points")

        # 1. Remove NaN
        nan_mask = ~np.isnan(points).any(axis=1)
        points = points[nan_mask]
        if np.sum(~nan_mask) > 0:
            logger.info(f"Removed {np.sum(~nan_mask)} NaN points")

        # 2. Voxel downsampling FIRST to drastically reduce amount of data
        points = self.downsample(points)

        # 3. Outlier removal (skip if still huge, otherwise it takes too long)
        if len(points) < 500_000:
            points = self.remove_outliers(points)
        else:
            logger.info(f"Skipping outlier removal because dataset is too large ({len(points)} points).")

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

        Args:
            points: Array of shape (N, 3)

        Returns:
            Filtered points
        """
        original_count = len(points)
        logger.info(f"Removing outliers (>{self.outlier_std}σ)")

        try:
            import open3d as o3d
            pcd = o3d.geometry.PointCloud()
            pcd.points = o3d.utility.Vector3dVector(points)
            pcd_clean, inlier_idx = pcd.remove_statistical_outlier(
                nb_neighbors=20,
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
