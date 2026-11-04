import 'package:flutter/material.dart';

/// Status einer Jagd (entspricht `public.hunt_status`).
enum HuntStatus {
  geplant('geplant', 'Geplant'),
  laufend('laufend', 'Läuft'),
  beendet('beendet', 'Beendet'),
  abgesagt('abgesagt', 'Abgesagt');

  const HuntStatus(this.value, this.label);

  final String value;
  final String label;

  /// Selbsteintragung ist nur bei geplanten und laufenden Jagden möglich.
  bool get isOpen => this == geplant || this == laufend;

  static HuntStatus fromValue(String value) =>
      HuntStatus.values.firstWhere((s) => s.value == value, orElse: () => HuntStatus.geplant);
}

/// Rolle einer Person in einer Jagd (entspricht `public.hunt_role`).
/// Unabhängig von der Rolle in der Gruppe (owner/admin/member).
enum HuntRole {
  jagdleiter('jagdleiter', 'Jagdleiter', Icons.flag_outlined),
  ansteller('ansteller', 'Ansteller', Icons.assignment_ind_outlined),
  schuetze('schuetze', 'Schütze', Icons.gps_fixed),
  treiber('treiber', 'Treiber', Icons.directions_walk),
  hundefuehrer('hundefuehrer', 'Hundeführer', Icons.pets_outlined),
  bergung('bergung', 'Bergung', Icons.local_shipping_outlined),
  sonstige('sonstige', 'Sonstige', Icons.person_outline);

  const HuntRole(this.value, this.label, this.icon);

  final String value;
  final String label;
  final IconData icon;

  /// Rollen mit Jagdleitungsrechten (Jagd, Zonen, Stände bearbeiten, zuteilen).
  bool get isLead => this == jagdleiter || this == ansteller;

  /// Rollen, die man sich selbst geben darf.
  static List<HuntRole> get selfAssignable => values.where((r) => !r.isLead).toList();

  static HuntRole fromValue(String value) =>
      HuntRole.values.firstWhere((r) => r.value == value, orElse: () => HuntRole.sonstige);
}

/// Art einer Fläche in einer Jagd (entspricht `public.hunt_zone_kind`).
enum HuntZoneKind {
  treiben('treiben', 'Treiben'),
  sicherheitszone('sicherheitszone', 'Sicherheitszone'),
  sperrzone('sperrzone', 'Sperrzone'),
  sammelplatz('sammelplatz', 'Sammelplatz'),
  sonstiges('sonstiges', 'Sonstiges');

  const HuntZoneKind(this.value, this.label);

  final String value;
  final String label;

  static HuntZoneKind fromValue(String value) =>
      HuntZoneKind.values.firstWhere((k) => k.value == value, orElse: () => HuntZoneKind.sonstiges);
}

/// Art einer Meldung (entspricht `public.hunt_report_kind`).
enum HuntReportKind {
  erlegt('erlegt', 'Erlegt', Icons.check_circle_outline),
  angeschossen('angeschossen', 'Angeschossen', Icons.warning_amber_rounded),
  ueberschossen('ueberschossen', 'Überschossen', Icons.close),
  anblick('anblick', 'Anblick', Icons.visibility_outlined),
  sonstiges('sonstiges', 'Sonstiges', Icons.chat_bubble_outline);

  const HuntReportKind(this.value, this.label, this.icon);

  final String value;
  final String label;
  final IconData icon;

  /// Meldungen, die eine Folgeaktion brauchen (Nachsuche, Bergung).
  bool get needsFollowUp => this == angeschossen || this == erlegt;

  static HuntReportKind fromValue(String value) =>
      HuntReportKind.values.firstWhere((k) => k.value == value, orElse: () => HuntReportKind.sonstiges);
}
