import 'package:flutter/material.dart';

/// Zentrale Farbpalette: Waldgrün, Anthrazit, Sand- und Rindentöne.
abstract final class AppColors {
  // Grüntöne
  static const forestDeep = Color(0xFF16291F);
  static const forest = Color(0xFF24402F);
  static const forestMid = Color(0xFF3A5E47);
  static const moss = Color(0xFF6E8B5E);
  static const mossLight = Color(0xFFA9C29A);

  // Neutrale Töne
  static const anthracite = Color(0xFF2A2D2F);
  static const charcoal = Color(0xFF17191A);
  static const slate = Color(0xFF5B6164);

  // Akzente
  static const sand = Color(0xFFD9C8A3);
  static const sandLight = Color(0xFFEDE3CC);
  static const beige = Color(0xFFF6F1E6);
  static const bark = Color(0xFF7C5F3E);

  // Signalfarben (Sicherheit im Jagdbetrieb)
  static const signalOrange = Color(0xFFE07B24);
  static const danger = Color(0xFFB3261E);
  static const dangerLight = Color(0xFFF2B8B5);
  static const success = Color(0xFF3F7D4E);
}
