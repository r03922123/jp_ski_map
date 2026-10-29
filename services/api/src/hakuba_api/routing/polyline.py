def decode_polyline(encoded: str, precision: int = 6) -> list[tuple[float, float]]:
    """Decode an encoded polyline into GeoJSON-ordered (lng, lat) pairs.

    Valhalla uses precision 6; Google's reference format uses 5.
    """
    factor = 10**precision
    points: list[tuple[float, float]] = []
    index = lat = lng = 0
    while index < len(encoded):
        deltas: list[int] = []
        for _ in range(2):
            shift = result = 0
            while True:
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        lat += deltas[0]
        lng += deltas[1]
        points.append((round(lng / factor, precision), round(lat / factor, precision)))
    return points
