"""
Orientation Calculator Service.
Computes geological orientation parameters (dip, dip direction, strike)
from plane normal vectors.
"""
import numpy as np
import logging
from typing import Dict, List, Tuple

logger = logging.getLogger(__name__)


class OrientationCalculator:
    """
    Calculate geological orientation parameters for detected planes.

    Convention:
    - Dip: angle between the plane and horizontal (0° = horizontal, 90° = vertical)
    - Dip Direction: azimuth direction where the plane dips (0-360°, measured clockwise from North)
    - Strike: direction of the horizontal line on the plane (dip_direction - 90°, using right-hand rule)
    """

    @staticmethod
    def normal_to_orientation(normal: np.ndarray) -> Dict[str, float]:
        """
        Convert a 3D plane normal vector to geological orientation.

        Assumes: X=East, Y=North, Z=Up coordinate system.

        Args:
            normal: Unit normal vector [nx, ny, nz]

        Returns:
            Dict with 'dip', 'dip_direction', 'strike' in degrees
        """
        normal = np.array(normal, dtype=np.float64)
        norm_mag = np.linalg.norm(normal)
        if norm_mag < 1e-10:
            return {'dip': 0.0, 'dip_direction': 0.0, 'strike': 0.0}

        normal = normal / norm_mag

        # Ensure normal points upward (positive z)
        if normal[2] < 0:
            normal = -normal

        nx, ny, nz = normal

        # Dip angle: angle between normal and vertical axis
        # dip = 90° - angle_from_vertical = arccos(|nz|)
        # But more precisely: dip = arctan(sqrt(nx² + ny²) / |nz|)
        horizontal_component = np.sqrt(nx**2 + ny**2)

        if horizontal_component < 1e-10:
            # Nearly horizontal plane
            dip = 0.0
            dip_direction = 0.0
        else:
            dip = np.degrees(np.arctan2(horizontal_component, abs(nz)))

            # Dip direction: azimuth of the horizontal projection of the normal
            # Measured clockwise from North (Y-axis)
            # Since the normal points away from the dipping surface,
            # the dip direction is the azimuth of the downward-dipping direction
            dip_direction = np.degrees(np.arctan2(nx, ny))

            if dip_direction < 0:
                dip_direction += 360.0

        # Strike: perpendicular to dip direction (right-hand rule)
        strike = (dip_direction - 90.0) % 360.0

        return {
            'dip': round(float(dip), 2),
            'dip_direction': round(float(dip_direction), 2),
            'strike': round(float(strike), 2),
        }

    @staticmethod
    def compute_all_orientations(planes: List[Dict]) -> List[Dict]:
        """
        Compute orientation for all detected planes.

        Args:
            planes: List of plane dicts (must have 'normal' key)

        Returns:
            Same planes list with added orientation fields
        """
        for plane in planes:
            orientation = OrientationCalculator.normal_to_orientation(plane['normal'])
            plane.update(orientation)

        logger.info(f"Computed orientations for {len(planes)} planes")
        return planes

    @staticmethod
    def compute_mean_orientation(normals: List[np.ndarray]) -> Dict[str, float]:
        """
        Compute the mean orientation from multiple normal vectors.
        Uses Fisher statistics for proper spherical averaging.

        Args:
            normals: List of unit normal vectors

        Returns:
            Mean orientation dict
        """
        if not normals:
            return {'dip': 0, 'dip_direction': 0, 'strike': 0}

        normals = np.array(normals)

        # Ensure consistent hemisphere (all pointing upward)
        for i in range(len(normals)):
            if normals[i, 2] < 0:
                normals[i] = -normals[i]

        # Mean direction (Fisher mean)
        mean_normal = np.mean(normals, axis=0)
        mean_mag = np.linalg.norm(mean_normal)

        if mean_mag < 1e-10:
            return {'dip': 0, 'dip_direction': 0, 'strike': 0}

        mean_normal = mean_normal / mean_mag

        orientation = OrientationCalculator.normal_to_orientation(mean_normal)

        # Add dispersion parameter (Fisher's kappa)
        R = mean_mag * len(normals) / len(normals)
        if R < 1.0:
            kappa = (len(normals) - 1) / (len(normals) - R * len(normals))
        else:
            kappa = float('inf')

        orientation['fisher_kappa'] = round(float(min(kappa, 9999)), 2)
        orientation['resultant_length'] = round(float(R), 4)

        return orientation

    @staticmethod
    def classify_plane_type(dip: float) -> str:
        """
        Classify a plane based on its dip angle.

        Args:
            dip: Dip angle in degrees

        Returns:
            Classification string
        """
        if dip < 10:
            return "Sub-horizontal (Bedding/Floor)"
        elif dip < 30:
            return "Gentle dip"
        elif dip < 60:
            return "Moderate dip"
        elif dip < 80:
            return "Steep dip"
        else:
            return "Sub-vertical (Joint/Fault)"
