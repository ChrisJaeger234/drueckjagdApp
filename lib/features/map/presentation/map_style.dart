import 'package:flutter/material.dart';

/// Kartenhintergrund.
enum MapStyle {
  outdoors('Gelände', Icons.terrain_outlined, 'outdoors-v12'),
  satellite('Luftbild', Icons.satellite_alt_outlined, 'satellite-streets-v12');

  const MapStyle(this.label, this.icon, this.mapboxStyleId);

  final String label;
  final IconData icon;
  final String mapboxStyleId;
}

/// Kachelquelle für einen [MapStyle].
///
/// Mit Mapbox-Token kommen die Kacheln aus der Mapbox Static Tiles API
/// (512 px, @2x für scharfe Darstellung). Ohne Token fällt die Karte auf die
/// OpenStreetMap-Standardkarte zurück (ohne Luftbild).
class MapTileSource {
  const MapTileSource({
    required this.urlTemplate,
    required this.attribution,
    this.tileDimension = 256,
    this.zoomOffset = 0,
  });

  factory MapTileSource.forStyle(MapStyle style, {required String mapboxToken}) {
    if (!mapboxToken.startsWith('pk.')) {
      return const MapTileSource(
        urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: ['© OpenStreetMap-Mitwirkende'],
      );
    }
    return MapTileSource(
      urlTemplate:
          'https://api.mapbox.com/styles/v1/mapbox/${style.mapboxStyleId}/tiles/512/{z}/{x}/{y}@2x'
          '?access_token=$mapboxToken',
      attribution: const ['© Mapbox', '© OpenStreetMap-Mitwirkende'],
      tileDimension: 512,
      zoomOffset: -1,
    );
  }

  final String urlTemplate;
  final List<String> attribution;
  final int tileDimension;
  final double zoomOffset;

  bool get isMapbox => urlTemplate.contains('api.mapbox.com');
}
