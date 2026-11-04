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

  /// Liest Koordinaten wie aus Google Maps kopiert: „51.16868, 7.24749“.
  /// Akzeptiert auch Semikolon/Leerzeichen als Trenner und Dezimalkomma
  /// („51,16868; 7,24749“). `null` bei ungültiger Eingabe.
  static GeoPoint? tryParse(String input) {
    final text = input.trim();
    if (text.isEmpty) return null;
    List<String> parts;
    if (text.contains(';')) {
      parts = text.split(';');
    } else if (RegExp(r'^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$').hasMatch(text)) {
      parts = text.split(',');
    } else {
      parts = text.split(RegExp(r'\s+'));
    }
    if (parts.length != 2) return null;
    final lat = double.tryParse(parts[0].trim().replaceAll(',', '.'));
    final lng = double.tryParse(parts[1].trim().replaceAll(',', '.'));
    if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return GeoPoint(lat, lng);
  }

  /// „51.168682, 7.247495“ (6 Nachkommastellen ≈ 10 cm).
  String format() => '${latitude.toStringAsFixed(6)}, ${longitude.toStringAsFixed(6)}';

  @override
  bool operator ==(Object other) => other is GeoPoint && other.latitude == latitude && other.longitude == longitude;

  @override
  int get hashCode => Object.hash(latitude, longitude);

  @override
  String toString() => 'GeoPoint($latitude, $longitude)';
}
