"""
Structural Insights Engine.
Rule-based mining intelligence that generates safety,
optimization, and risk insights from structural analysis.
"""
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


class InsightsEngine:
    """
    Generate mining intelligence insights from structural mapping results.
    Analyzes discontinuity orientations relative to common mining scenarios
    and produces actionable recommendations for drill & blast optimization.
    """

    # Free face direction (can be configured per mine)
    DEFAULT_FREE_FACE_AZIMUTH = 180.0  # South-facing free face (common in UG development)

    @staticmethod
    def generate_insights(
        planes: List[Dict],
        sets: List[Dict],
        free_face_azimuth: float = None
    ) -> List[Dict]:
        """
        Generate structural insights from analysis results.

        Args:
            planes: List of plane dicts with orientation data
            sets: List of discontinuity set dicts
            free_face_azimuth: Azimuth direction of the free face (degrees)

        Returns:
            List of insight dicts with category, severity, title,
            description, recommendation, and related_sets
        """
        if free_face_azimuth is None:
            free_face_azimuth = InsightsEngine.DEFAULT_FREE_FACE_AZIMUTH

        insights = []

        # 1. Analyze each set relative to free face
        for s in sets:
            set_insights = InsightsEngine._analyze_set_vs_free_face(s, free_face_azimuth)
            insights.extend(set_insights)

        # 2. Overall structural complexity
        insights.extend(InsightsEngine._analyze_structural_complexity(sets))

        # 3. Stability risks
        insights.extend(InsightsEngine._analyze_stability_risks(planes, sets))

        # 4. Blast optimization
        insights.extend(InsightsEngine._analyze_blast_optimization(sets, free_face_azimuth))

        # 5. Overbreak potential
        insights.extend(InsightsEngine._analyze_overbreak_risk(sets, free_face_azimuth))

        logger.info(f"Generated {len(insights)} structural insights")
        return insights

    @staticmethod
    def _analyze_set_vs_free_face(disc_set: Dict, free_face_az: float) -> List[Dict]:
        """Analyze a discontinuity set relative to the free face direction."""
        insights = []
        set_id = disc_set['set_id']
        dip = disc_set['mean_dip']
        dip_dir = disc_set['mean_dip_direction']
        strike = disc_set['mean_strike']

        # Angular difference between dip direction and free face
        angle_diff = abs(dip_dir - free_face_az)
        if angle_diff > 180:
            angle_diff = 360 - angle_diff

        # Strike difference from free face
        strike_diff = abs(strike - free_face_az)
        if strike_diff > 180:
            strike_diff = 360 - strike_diff

        # Rule 1: Joint dipping toward free face → Good blast movement
        if angle_diff < 30 and dip > 30:
            insights.append({
                'category': 'optimization',
                'severity': 'low',
                'title': f'Favorable blast geometry — Set {set_id + 1}',
                'description': (
                    f'Discontinuity Set {set_id + 1} (dip {dip:.0f}°/{dip_dir:.0f}°) '
                    f'dips toward the free face. This promotes forward rock movement '
                    f'during blasting.'
                ),
                'recommendation': (
                    'Good forward blast movement expected. Optimize fragmentation by '
                    'adjusting burden and spacing to take advantage of the natural '
                    'discontinuity orientation. Consider reducing explosive charge.'
                ),
                'related_sets': [set_id],
            })

        # Rule 2: Joint dipping against free face → Risk of back break
        elif angle_diff > 150 and dip > 30:
            severity = 'high' if dip > 60 else 'medium'
            insights.append({
                'category': 'risk',
                'severity': severity,
                'title': f'Back-break risk — Set {set_id + 1}',
                'description': (
                    f'Discontinuity Set {set_id + 1} (dip {dip:.0f}°/{dip_dir:.0f}°) '
                    f'dips against the free face direction. This creates significant '
                    f'back-break risk and may cause overbreak behind the blast face.'
                ),
                'recommendation': (
                    'Risk of back break detected. Consider: (1) pre-splitting along '
                    'the perimeter, (2) reducing charge in back-row holes, '
                    '(3) increasing timing delay to direct energy toward the free face.'
                ),
                'related_sets': [set_id],
            })

        # Rule 3: Strike perpendicular to free face → Uneven fragmentation
        if 60 < strike_diff < 120 and dip > 20:
            insights.append({
                'category': 'optimization',
                'severity': 'medium',
                'title': f'Uneven fragmentation potential — Set {set_id + 1}',
                'description': (
                    f'Discontinuity Set {set_id + 1} (strike {strike:.0f}°) is oriented '
                    f'perpendicular to the free face. This may cause uneven fragmentation '
                    f'patterns with large blocky fragments.'
                ),
                'recommendation': (
                    'Possible uneven fragmentation. Consider adjusting drill pattern '
                    'orientation to be more aligned with the discontinuity strike. '
                    'Staggered patterns may improve uniformity.'
                ),
                'related_sets': [set_id],
            })

        # Rule 4: Sub-vertical joints → Loose block formation risk
        if dip > 75:
            insights.append({
                'category': 'safety',
                'severity': 'high',
                'title': f'Sub-vertical discontinuity — Set {set_id + 1}',
                'description': (
                    f'Discontinuity Set {set_id + 1} contains near-vertical joints '
                    f'(dip {dip:.0f}°). These can create loose blocks in the roof '
                    f'and walls, posing fall-of-ground hazards.'
                ),
                'recommendation': (
                    'Install rock bolts across this discontinuity set. Monitor for '
                    'wedge formation between this set and intersecting sets. '
                    'Consider shotcrete application in the immediate area.'
                ),
                'related_sets': [set_id],
            })

        # Rule 5: Sub-horizontal planes → Roof stability concern
        if dip < 15:
            insights.append({
                'category': 'safety',
                'severity': 'medium',
                'title': f'Sub-horizontal discontinuity — Set {set_id + 1}',
                'description': (
                    f'Discontinuity Set {set_id + 1} is nearly horizontal '
                    f'(dip {dip:.0f}°). This may represent bedding planes or '
                    f'weathering surfaces that weaken roof integrity.'
                ),
                'recommendation': (
                    'Monitor roof condition closely. Sub-horizontal planes can cause '
                    'beam failure in unsupported spans. Install pattern bolting and '
                    'check for signs of delamination.'
                ),
                'related_sets': [set_id],
            })

        return insights

    @staticmethod
    def _analyze_structural_complexity(sets: List[Dict]) -> List[Dict]:
        """Analyze overall structural complexity."""
        insights = []
        n_sets = len(sets)

        if n_sets >= 4:
            insights.append({
                'category': 'risk',
                'severity': 'high',
                'title': 'High structural complexity detected',
                'description': (
                    f'{n_sets} discontinuity sets identified. High structural complexity '
                    f'increases the potential for wedge formation, loose blocks, and '
                    f'unpredictable blast fragmentation.'
                ),
                'recommendation': (
                    'Conduct detailed wedge analysis for critical intersections. '
                    'Consider enhanced ground support (cable bolts, mesh). '
                    'Adjust blast design to account for multiple joint orientations.'
                ),
                'related_sets': [s['set_id'] for s in sets],
            })
        elif n_sets <= 2:
            insights.append({
                'category': 'optimization',
                'severity': 'low',
                'title': 'Simple structural environment',
                'description': (
                    f'Only {n_sets} discontinuity sets identified. The rock mass has '
                    f'relatively simple structure, which typically allows for more '
                    f'predictable blast outcomes.'
                ),
                'recommendation': (
                    'Take advantage of the simple structure by optimizing drill pattern '
                    'alignment with the dominant discontinuity set. Standard blast designs '
                    'should work well.'
                ),
                'related_sets': [s['set_id'] for s in sets],
            })

        return insights

    @staticmethod
    def _analyze_stability_risks(planes: List[Dict], sets: List[Dict]) -> List[Dict]:
        """Check for dangerous wedge-forming intersections between sets."""
        insights = []

        import numpy as np

        for i, s1 in enumerate(sets):
            for s2 in sets[i+1:]:
                # Check if two sets can form dangerous wedges
                n1 = np.array([
                    np.sin(np.radians(s1['mean_dip'])) * np.sin(np.radians(s1['mean_dip_direction'])),
                    np.sin(np.radians(s1['mean_dip'])) * np.cos(np.radians(s1['mean_dip_direction'])),
                    np.cos(np.radians(s1['mean_dip']))
                ])
                n2 = np.array([
                    np.sin(np.radians(s2['mean_dip'])) * np.sin(np.radians(s2['mean_dip_direction'])),
                    np.sin(np.radians(s2['mean_dip'])) * np.cos(np.radians(s2['mean_dip_direction'])),
                    np.cos(np.radians(s2['mean_dip']))
                ])

                # Intersection line direction
                intersection = np.cross(n1, n2)
                int_mag = np.linalg.norm(intersection)

                if int_mag > 0.1:  # Planes are not parallel
                    # Plunge of intersection line
                    intersection = intersection / int_mag
                    plunge = np.degrees(np.arcsin(abs(intersection[2])))

                    if 20 < plunge < 70:
                        insights.append({
                            'category': 'safety',
                            'severity': 'high',
                            'title': f'Wedge formation risk — Sets {s1["set_id"]+1} & {s2["set_id"]+1}',
                            'description': (
                                f'The intersection of Sets {s1["set_id"]+1} and {s2["set_id"]+1} '
                                f'forms a potential sliding wedge (plunge {plunge:.0f}°). '
                                f'This is a significant ground control hazard.'
                            ),
                            'recommendation': (
                                'Install targeted support (spot bolts, cable bolts) to '
                                'secure potential wedge blocks. Monitor convergence in this '
                                'area. Consider revising excavation sequence if possible.'
                            ),
                            'related_sets': [s1['set_id'], s2['set_id']],
                        })

        return insights

    @staticmethod
    def _analyze_blast_optimization(sets: List[Dict], free_face_az: float) -> List[Dict]:
        """Generate blast optimization recommendations."""
        insights = []

        if not sets:
            return insights

        # Find dominant set (most planes)
        dominant = max(sets, key=lambda s: s['num_planes'])

        # Recommend drill alignment
        optimal_drill_dir = (dominant['mean_strike'] + 90) % 360
        insights.append({
            'category': 'optimization',
            'severity': 'medium',
            'title': 'Recommended drill orientation',
            'description': (
                f'Based on the dominant discontinuity set (Set {dominant["set_id"]+1}, '
                f'strike {dominant["mean_strike"]:.0f}°), the optimal drill pattern '
                f'orientation is approximately {optimal_drill_dir:.0f}° azimuth.'
            ),
            'recommendation': (
                f'Orient drill rows at {optimal_drill_dir:.0f}° azimuth for optimal '
                f'interaction with the dominant discontinuity set. This minimizes '
                f'ore dilution and improves fragmentation uniformity.'
            ),
            'related_sets': [dominant['set_id']],
        })

        return insights

    @staticmethod
    def _analyze_overbreak_risk(sets: List[Dict], free_face_az: float) -> List[Dict]:
        """Analyze potential for overbreak/underbreak."""
        insights = []

        for s in sets:
            dip_dir = s['mean_dip_direction']
            dip = s['mean_dip']

            # Check for sets parallel to excavation walls
            angle_to_face = abs(s['mean_strike'] - free_face_az)
            if angle_to_face > 180:
                angle_to_face = 360 - angle_to_face

            if angle_to_face < 20 and dip > 40:
                insights.append({
                    'category': 'risk',
                    'severity': 'high',
                    'title': f'Overbreak risk — Set {s["set_id"]+1}',
                    'description': (
                        f'Discontinuity Set {s["set_id"]+1} (strike {s["mean_strike"]:.0f}°) '
                        f'runs nearly parallel to the excavation face with steep dip '
                        f'({dip:.0f}°). This is the primary cause of overbreak in UG mining.'
                    ),
                    'recommendation': (
                        'High overbreak potential. Implement: (1) smooth wall blasting '
                        'along this discontinuity, (2) reduce perimeter hole charges by 30-50%, '
                        '(3) decrease perimeter hole spacing. Monitor ore dilution rates.'
                    ),
                    'related_sets': [s['set_id']],
                })

        return insights
