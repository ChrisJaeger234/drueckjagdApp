/// Geografischer Punkt in WGS84.
class GeoPoint {
  const GeoPoint(this.latitude, this.longitude)
    : assert(latitude >= -90 && latitude <= 90),
      assert(longitude >= -180 && longitude <= 180);

  final double latitude;
  final double longitude;

  /// Liest `latitude`/`longitude` (bzw. eigene Spaltennamen); `null`, wenn eine fehlt.
  static GeoPoint? maybeFromJson(Map<String, dynamic> json, {String lat = 'latitude', String lng = 'longitude'}) {
    final la = json[lat], lo = json[lng];
    if (la is! num || lo is! num) return null;
    return GeoPoint(la.toDouble(), lo.toDouble());
  }

  @override
  bool operator ==(Object other) => other is GeoPoint && other.latitude == latitude && other.longitude == longitude;

  @override
  int get hashCode => Object.hash(latitude, longitude);

  @override
  String toString() => 'GeoPoint($latitude, $longitude)';
}
