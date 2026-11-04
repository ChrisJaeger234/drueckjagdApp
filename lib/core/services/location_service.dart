import 'package:geolocator/geolocator.dart';

import '../errors/app_exception.dart';
import '../geo/geo_point.dart';

/// Eigene Position mit Genauigkeit in Metern.
class DevicePosition {
  const DevicePosition(this.point, {this.accuracy});

  final GeoPoint point;
  final double? accuracy;
}

/// Zugriff auf das GPS des Geräts (bzw. die Standortfreigabe des Browsers).
abstract interface class LocationService {
  /// Fragt bei Bedarf die Berechtigung an und liefert die aktuelle Position.
  /// Wirft [AppException] mit verständlicher Meldung, wenn es nicht geht.
  Future<DevicePosition> current();

  /// Laufende Positionsupdates (nach erfolgreichem [current]).
  Stream<DevicePosition> watch();
}

class GeolocatorLocationService implements LocationService {
  const GeolocatorLocationService();

  static DevicePosition _map(Position p) => DevicePosition(GeoPoint(p.latitude, p.longitude), accuracy: p.accuracy);

  Future<void> _ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const AppException('Die Ortung ist auf diesem Gerät ausgeschaltet.', kind: AppErrorKind.forbidden);
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      throw const AppException(
        'Ohne Standortfreigabe kann die Karte deine Position nicht zeigen. '
        'Du kannst sie in den Einstellungen erlauben.',
        kind: AppErrorKind.forbidden,
      );
    }
  }

  @override
  Future<DevicePosition> current() async {
    await _ensurePermission();
    try {
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
      );
      return _map(p);
    } on Exception {
      final last = await Geolocator.getLastKnownPosition();
      if (last != null) return _map(last);
      throw const AppException('Deine Position konnte nicht bestimmt werden.', kind: AppErrorKind.unknown);
    }
  }

  @override
  Stream<DevicePosition> watch() => Geolocator.getPositionStream(
    locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 5),
  ).map(_map);
}
