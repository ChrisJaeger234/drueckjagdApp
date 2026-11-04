import 'package:flutter/material.dart';

import '../../../core/widgets/preview_feature_view.dart';

/// Tab „Karte“ – Vorschau, umgesetzt in Phase 2.
class MapPreviewScreen extends StatelessWidget {
  const MapPreviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Karte')),
      body: const PreviewFeatureView(
        icon: Icons.map_outlined,
        title: 'Gemeinsame Revierkarte',
        description: 'Hier entsteht die digitale Revierkarte deiner Gruppe – auch offline nutzbar.',
        plannedFeatures: [
          'Mapbox-Karte mit Offline-Kartenpaketen',
          'Reviergrenzen zeichnen sowie KML-/GPX-Import',
          'Hochsitze, Kanzeln, Kirrungen, Fütterungen und Wildkameras',
          'Eigener GPS-Standort und Live-Standortfreigabe in der Gruppe',
          'Fotos und Notizen zu Wegpunkten',
        ],
      ),
    );
  }
}
