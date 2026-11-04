import 'dart:math' as math;

import 'geo_point.dart';

/// Polygon mit Außenring und optionalen Löchern (Punkte ohne Wiederholung
/// des ersten Punkts am Ende).
class GeoPolygon {
  const GeoPolygon(this.outer, [this.holes = const []]);

  final List<GeoPoint> outer;
  final List<List<GeoPoint>> holes;
}

/// Umschließendes Rechteck.
class GeoBounds {
  const GeoBounds({required this.south, required this.west, required this.north, required this.east});

  /// `null`, wenn [points] leer ist.
  static GeoBounds? fromPoints(Iterable<GeoPoint> points) {
    double? s, w, n, e;
    for (final p in points) {
      s = s == null || p.latitude < s ? p.latitude : s;
      n = n == null || p.latitude > n ? p.latitude : n;
      w = w == null || p.longitude < w ? p.longitude : w;
      e = e == null || p.longitude > e ? p.longitude : e;
    }
    if (s == null) return null;
    return GeoBounds(south: s, west: w!, north: n!, east: e!);
  }

  final double south;
  final double west;
  final double north;
  final double east;

  GeoPoint get center => GeoPoint((south + north) / 2, (west + east) / 2);
}

/// Hilfen für das GeoJSON, das die Datenbank speichert
/// (`revier_boundaries.boundary_data`, `hunt_zones.boundary_data`).
abstract final class GeoJson {
  /// Liest Polygone aus Polygon, MultiPolygon, Feature, FeatureCollection
  /// oder GeometryCollection. Unbekanntes oder Kaputtes wird übersprungen.
  static List<GeoPolygon> polygons(Object? geojson) {
    if (geojson is! Map) return const [];
    switch (geojson['type']) {
      case 'Polygon':
        final p = _polygon(geojson['coordinates']);
        return p == null ? const [] : [p];
      case 'MultiPolygon':
        final coords = geojson['coordinates'];
        if (coords is! List) return const [];
        return [for (final c in coords) ?_polygon(c)];
      case 'Feature':
        return polygons(geojson['geometry']);
      case 'FeatureCollection':
        final features = geojson['features'];
        if (features is! List) return const [];
        return [for (final f in features) ...polygons(f)];
      case 'GeometryCollection':
        final geometries = geojson['geometries'];
        if (geometries is! List) return const [];
        return [for (final g in geometries) ...polygons(g)];
      default:
        return const [];
    }
  }

  /// GeoJSON-Polygon aus einem Ring (wird geschlossen).
  static Map<String, dynamic> polygon(List<GeoPoint> ring) {
    if (ring.length < 3) throw ArgumentError('Ein Polygon braucht mindestens drei Punkte.');
    final coords = [for (final p in ring) _round(p)];
    if (ring.first != ring.last) coords.add(_round(ring.first));
    return {
      'type': 'Polygon',
      'coordinates': [coords],
    };
  }

  /// Alle Eckpunkte (für Kartenausschnitt).
  static Iterable<GeoPoint> allPoints(List<GeoPolygon> polygons) sync* {
    for (final p in polygons) {
      yield* p.outer;
    }
  }

  /// Liegt [point] in einer der Flächen (Löcher ausgenommen)?
  static bool contains(List<GeoPolygon> polygons, GeoPoint point) {
    for (final p in polygons) {
      if (_inRing(p.outer, point) && !p.holes.any((h) => _inRing(h, point))) return true;
    }
    return false;
  }

  static bool _inRing(List<GeoPoint> ring, GeoPoint p) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      final a = ring[i], b = ring[j];
      if ((a.latitude > p.latitude) != (b.latitude > p.latitude) &&
          p.longitude <
              (b.longitude - a.longitude) * (p.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude) {
        inside = !inside;
      }
    }
    return inside;
  }

  /// Fläche in Hektar (sphärische Näherung, Löcher abgezogen).
  static double areaHectares(List<GeoPolygon> polygons) {
    var m2 = 0.0;
    for (final p in polygons) {
      m2 += _ringArea(p.outer).abs();
      for (final h in p.holes) {
        m2 -= _ringArea(h).abs();
      }
    }
    return m2 / 10000;
  }

  static List<double> _round(GeoPoint p) => [
    double.parse(p.longitude.toStringAsFixed(7)),
    double.parse(p.latitude.toStringAsFixed(7)),
  ];

  static GeoPolygon? _polygon(Object? coords) {
    if (coords is! List || coords.isEmpty) return null;
    final rings = <List<GeoPoint>>[];
    for (final r in coords) {
      final ring = _ring(r);
      if (ring != null) rings.add(ring);
    }
    if (rings.isEmpty) return null;
    return GeoPolygon(rings.first, rings.skip(1).toList());
  }

  static List<GeoPoint>? _ring(Object? coords) {
    if (coords is! List) return null;
    final points = <GeoPoint>[];
    for (final c in coords) {
      if (c is! List || c.length < 2 || c[0] is! num || c[1] is! num) return null;
      final lng = (c[0] as num).toDouble(), lat = (c[1] as num).toDouble();
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      points.add(GeoPoint(lat, lng));
    }
    if (points.length > 1 && points.first == points.last) points.removeLast();
    return points.length >= 3 ? points : null;
  }

  // Fläche eines Rings auf der Kugel (nach Chamberlain & Duquette).
  static double _ringArea(List<GeoPoint> ring) {
    const r = 6378137.0;
    const rad = math.pi / 180;
    var total = 0.0;
    for (var i = 0; i < ring.length; i++) {
      final a = ring[i], b = ring[(i + 1) % ring.length];
      total += (b.longitude - a.longitude) * rad * (2 + math.sin(a.latitude * rad) + math.sin(b.latitude * rad));
    }
    return total * r * r / 2;
  }
}
