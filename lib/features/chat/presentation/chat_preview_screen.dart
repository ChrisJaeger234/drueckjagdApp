import 'package:flutter/material.dart';

import '../../../core/widgets/preview_feature_view.dart';

/// Tab „Chat“ – Vorschau, umgesetzt in Phase 2.
class ChatPreviewScreen extends StatelessWidget {
  const ChatPreviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Chat')),
      body: const PreviewFeatureView(
        icon: Icons.forum_outlined,
        title: 'Gruppenchat & Meldungen',
        description: 'Schnelle Nachrichten an die ganze Gruppe – vor, während und nach dem Treiben.',
        plannedFeatures: [
          'Gruppenchat in Echtzeit (Supabase Realtime)',
          'Schnellmeldungen: erlegt, angeschossen, gefehlt, Nachsuche nötig',
          'Push-Benachrichtigungen (Firebase Cloud Messaging / APNs)',
          'Nachrichten offline vorbereiten und später senden',
        ],
      ),
    );
  }
}
