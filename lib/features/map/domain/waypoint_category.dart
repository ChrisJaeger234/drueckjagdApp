import 'package:flutter/material.dart';

/// Kategorien von Wegpunkten / jagdlichen Einrichtungen
/// (entspricht `public.waypoint_category`). Vorbereitung für Phase 2.
enum WaypointCategory {
  hochsitz('hochsitz', 'Hochsitz', Icons.chair_alt_outlined),
  kanzel('kanzel', 'Kanzel', Icons.cabin_outlined),
  kirrung('kirrung', 'Kirrung', Icons.grain),
  fuetterung('fuetterung', 'Fütterung', Icons.agriculture_outlined),
  wildkamera('wildkamera', 'Wildkamera', Icons.photo_camera_outlined),
  weg('weg', 'Weg', Icons.route_outlined),
  gefahr('gefahr', 'Gefahr', Icons.warning_amber_rounded),
  sonstiges('sonstiges', 'Sonstiges', Icons.place_outlined);

  const WaypointCategory(this.value, this.label, this.icon);

  final String value;
  final String label;
  final IconData icon;

  static WaypointCategory fromValue(String value) =>
      WaypointCategory.values.firstWhere((c) => c.value == value, orElse: () => WaypointCategory.sonstiges);
}
