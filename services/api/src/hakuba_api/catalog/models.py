from hakuba_api.common.geo import Coord, LocalizedName
from hakuba_api.common.models import ApiModel


class AccessPoint(ApiModel):
    """Where you park / start skiing; the routing target for a resort."""

    id: str
    name: LocalizedName
    coord: Coord
    coord_source: str


class TerrainPct(ApiModel):
    beginner: int
    intermediate: int
    advanced: int


class ResortStats(ApiModel):
    """Unknown values are None, never guessed."""

    base_elevation_m: int | None
    top_elevation_m: int | None
    vertical_m: int | None
    gondolas: int | None
    chair_lifts: int | None
    runs: int | None
    longest_run_m: int | None
    total_runs_m: int | None
    area_ha: int | None
    terrain_pct: TerrainPct | None
    night_skiing: bool | None
    day_ticket_jpy: int | None


class Resort(ApiModel):
    id: str
    name: LocalizedName
    region: str
    website: str
    access_points: list[AccessPoint]
    stats: ResortStats
    hakuba_valley_pass: bool
    stats_source: str
