import '../../features/hunts/domain/geo_point.dart';

/// App-weite Konstanten.
abstract final class AppConstants {
  static const appName = 'Drückjagd';
  static const appTagline = 'Revier · Gruppe · Jagdtag';

  /// Standard-Gültigkeit neuer Einladungscodes.
  static const defaultInviteValidity = Duration(days: 7);

  /// Startansicht der Karte, wenn noch kein Revier mit Grenze gewählt ist
  /// (Mittelpunkt des Reviers, von Chris festgelegt).
  static const defaultMapCenter = GeoPoint(51.16868205981034, 7.24749484403816);

  /// Zoomstufe der Startansicht (zeigt das ganze Revier, ca. 4 × 4 km).
  static const defaultMapZoom = 13.5;
}
