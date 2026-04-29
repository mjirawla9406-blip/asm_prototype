"""
Point Cloud Loader Service.
Handles loading LAS, PLY, and XYZ point cloud files.
"""
import numpy as np
from pathlib import Path
import logging
import struct

logger = logging.getLogger(__name__)

REQUIRE_GEOREF = False  # Set True in production to enforce CRS check
MIN_POINT_DENSITY_PER_M2 = 50  # Minimum points per square metre on stope walls


class PointCloudLoader:
    """Load point cloud files in various formats and convert to numpy arrays."""

    SUPPORTED_FORMATS = {'.las', '.laz', '.ply', '.xyz', '.txt', '.csv'}

    @staticmethod
    def load(filepath: str) -> tuple[np.ndarray, dict]:
        """
        Load a point cloud file and return points + metadata.

        Args:
            filepath: Path to point cloud file

        Returns:
            Tuple of (points_array [N,3], metadata_dict)
        """
        filepath = Path(filepath)
        if not filepath.exists():
            raise FileNotFoundError(f"File not found: {filepath}")

        ext = filepath.suffix.lower()
        if ext not in PointCloudLoader.SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported format: {ext}. Supported: {PointCloudLoader.SUPPORTED_FORMATS}")

        logger.info(f"Loading point cloud: {filepath} (format: {ext})")

        if ext in ('.las', '.laz'):
            return PointCloudLoader._load_las(filepath)
        elif ext == '.ply':
            return PointCloudLoader._load_ply(filepath)
        elif ext in ('.xyz', '.txt', '.csv'):
            return PointCloudLoader._load_xyz(filepath)
        else:
            raise ValueError(f"Unsupported format: {ext}")

    @staticmethod
    def _check_georef(header) -> bool:
        """Return True if the LAS header contains any CRS/georef VLR records."""
        try:
            vlrs = header.vlrs if hasattr(header, 'vlrs') else []
            crs_user_ids = {"LASF_Projection", "liblas", "GDAL_OGR_EVEN"}
            for vlr in vlrs:
                uid = getattr(vlr, 'user_id', '') or ''
                if any(crs in uid for crs in crs_user_ids):
                    return True
            return False
        except Exception:
            return False

    @staticmethod
    def _load_las(filepath: Path) -> tuple[np.ndarray, dict]:
        """Load LAS/LAZ format point cloud incrementally and downsample if large."""
        import laspy

        target_points = 2000000

        with laspy.open(str(filepath)) as f:
            header = f.header
            total_points = header.point_count

            skip = max(1, total_points // target_points)

            if REQUIRE_GEOREF and not PointCloudLoader._check_georef(header):
                raise ValueError(
                    "LAS file has no georeferencing (CRS/VLR metadata missing). "
                    "Ensure the file is georeferenced with ground control points before processing."
                )

            points_list = []
            colors_list = []

            for chunk in f.chunk_iterator(2_000_000):
                # Extract to standard numpy arrays first before slicing
                x = np.array(chunk.x)
                y = np.array(chunk.y)
                z = np.array(chunk.z)

                if skip > 1:
                    x = x[::skip]
                    y = y[::skip]
                    z = z[::skip]

                pts = np.vstack([x, y, z]).T.astype(np.float64)
                points_list.append(pts)

                try:
                    if hasattr(chunk, 'red') and hasattr(chunk, 'green') and hasattr(chunk, 'blue'):
                        r = np.array(chunk.red)
                        g = np.array(chunk.green)
                        b = np.array(chunk.blue)
                        
                        if skip > 1:
                            r = r[::skip]
                            g = g[::skip]
                            b = b[::skip]

                        cols = np.vstack([
                            r / 65535.0,
                            g / 65535.0,
                            b / 65535.0
                        ]).T
                        colors_list.append(cols)
                except Exception:
                    pass

            points = np.vstack(points_list) if points_list else np.empty((0, 3))
            colors = np.vstack(colors_list) if colors_list and len(colors_list) == len(points_list) else None

        metadata = {
            'format': 'LAS',
            'num_points': total_points,  # Report original count
            'has_colors': colors is not None,
            'file_size_mb': filepath.stat().st_size / (1024 * 1024),
            'bounds': {
                'x_min': float(header.mins[0]),
                'x_max': float(header.maxs[0]),
                'y_min': float(header.mins[1]),
                'y_max': float(header.maxs[1]),
                'z_min': float(header.mins[2]),
                'z_max': float(header.maxs[2]),
            },
            'point_format': header.point_format.id if hasattr(header, 'point_format') else None,
        }

        if colors is not None:
            metadata['colors'] = colors

        logger.info(f"Loaded {len(points)} points from LAS file (downsampled from {total_points})")
        return points, metadata

    @staticmethod
    def _load_ply(filepath: Path) -> tuple[np.ndarray, dict]:
        """Load PLY format point cloud."""
        try:
            import open3d as o3d
            pcd = o3d.io.read_point_cloud(str(filepath))
            points = np.asarray(pcd.points)
            colors = np.asarray(pcd.colors) if pcd.has_colors() else None
        except ImportError:
            # Fallback: basic PLY parser
            points, colors = PointCloudLoader._parse_ply_basic(filepath)

        metadata = {
            'format': 'PLY',
            'num_points': len(points),
            'has_colors': colors is not None,
            'file_size_mb': filepath.stat().st_size / (1024 * 1024),
        }

        logger.info(f"Loaded {len(points)} points from PLY file")
        return points, metadata

    @staticmethod
    def _load_xyz(filepath: Path) -> tuple[np.ndarray, dict]:
        """Load XYZ/TXT/CSV format point cloud."""
        try:
            data = np.loadtxt(str(filepath), delimiter=None, comments='#')
        except ValueError:
            data = np.loadtxt(str(filepath), delimiter=',', comments='#', skiprows=1)

        if data.shape[1] < 3:
            raise ValueError("XYZ file must have at least 3 columns (X, Y, Z)")

        points = data[:, :3]
        colors = data[:, 3:6] if data.shape[1] >= 6 else None

        metadata = {
            'format': 'XYZ',
            'num_points': len(points),
            'has_colors': colors is not None,
            'file_size_mb': filepath.stat().st_size / (1024 * 1024),
        }

        logger.info(f"Loaded {len(points)} points from XYZ file")
        return points, metadata

    @staticmethod
    def _parse_ply_basic(filepath: Path) -> tuple[np.ndarray, None]:
        """Basic PLY parser fallback when Open3D is not available."""
        points = []
        with open(filepath, 'r') as f:
            in_header = True
            vertex_count = 0
            for line in f:
                line = line.strip()
                if in_header:
                    if line.startswith('element vertex'):
                        vertex_count = int(line.split()[-1])
                    elif line == 'end_header':
                        in_header = False
                elif vertex_count > 0:
                    vals = line.split()
                    if len(vals) >= 3:
                        points.append([float(vals[0]), float(vals[1]), float(vals[2])])
                        vertex_count -= 1
        return np.array(points), None

    @staticmethod
    def validate_points(points: np.ndarray) -> dict:
        """Validate and return quality metrics for a point cloud."""
        if points.shape[1] != 3:
            raise ValueError(f"Expected (N, 3), got {points.shape}")

        nan_count = int(np.sum(np.isnan(points)))
        bounds = np.ptp(points, axis=0)
        centroid = np.mean(points, axis=0)

        # Compute density estimate
        try:
            from scipy.spatial import cKDTree
            tree = cKDTree(points[:min(10000, len(points))])
            dists, _ = tree.query(points[:min(10000, len(points))], k=2)
            mean_spacing = float(np.mean(dists[:, 1]))
        except Exception:
            mean_spacing = 0.0

        quality = max(0, min(100, 100 - (nan_count / max(1, len(points))) * 100))

        # Density guard
        if len(points) > 0:
            bounds_ptp = np.ptp(points, axis=0)
            # Estimate surface area as 2*(XZ + YZ) faces (dominant stope wall surfaces)
            surface_area_est = 2 * (
                bounds_ptp[0] * bounds_ptp[2] + bounds_ptp[1] * bounds_ptp[2]
            )
            surface_area_est = max(surface_area_est, 1.0)
            density_per_m2 = len(points) / surface_area_est
        else:
            density_per_m2 = 0.0

        density_ok = density_per_m2 >= MIN_POINT_DENSITY_PER_M2

        return {
            'valid': nan_count == 0,
            'nan_count': nan_count,
            'bounds': bounds.tolist(),
            'centroid': centroid.tolist(),
            'mean_spacing': mean_spacing,
            'quality': round(quality, 1),
            'density_per_m2': round(density_per_m2, 2),
            'density_ok': density_ok,
        }
