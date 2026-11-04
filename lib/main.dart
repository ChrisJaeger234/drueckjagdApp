import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ProviderScope(
      // Fehlgeschlagene Provider nicht automatisch wiederholen – der Benutzer
      // entscheidet per „Erneut versuchen“ bzw. Pull-to-Refresh.
      retry: (_, _) => null,
      child: const DrueckjagdApp(),
    ),
  );
}
