import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_spacing.dart';
import '../../../../core/geo/geo_point.dart';
import '../../../../core/geo/geojson.dart';
import '../../domain/waypoint.dart';
import 'app_map.dart';

/// Farbe der Reviergrenze (gut sichtbar auf Gelände und Luftbild).
const revierBoundaryColor = AppColors.signalOrange;

/// Flächen als Polygon-Ebene.
PolygonLayer<Object> polygonLayer(
  List<GeoPolygon> polygons, {
  required Color color,
  double fillOpacity = 0.08,
  double strokeWidth = 3,
  String? label,
  bool dashed = false,
}) => PolygonLayer<Object>(
  polygons: [
    for (final p in polygons)
      Polygon<Object>(
        points: [for (final q in p.outer) toLatLng(q)],
        holePointsList: [
          for (final h in p.holes) [for (final q in h) toLatLng(q)],
        ],
        color: color.withValues(alpha: fillOpacity),
        borderColor: color,
        borderStrokeWidth: strokeWidth,
        pattern: dashed ? StrokePattern.dashed(segments: const [12, 8]) : const StrokePattern.solid(),
        label: label,
        labelStyle: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 13, shadows: _halo),
      ),
  ],
);

const _halo = [Shadow(color: Colors.white, blurRadius: 3), Shadow(color: Colors.white, blurRadius: 6)];

/// Runder Kartenpunkt mit Symbol und optionaler Beschriftung darunter.
class MapPin extends StatelessWidget {
  const MapPin({
    super.key,
    required this.icon,
    required this.color,
    this.label,
    this.selected = false,
    this.faded = false,
    this.onTap,
    this.semanticLabel,
  });

  final IconData icon;
  final Color color;
  final String? label;
  final bool selected;
  final bool faded;
  final VoidCallback? onTap;
  final String? semanticLabel;

  static const size = 34.0;

  /// Breite und Höhe des Markers inkl. Beschriftung.
  static const markerWidth = 120.0;
  static const markerHeight = 66.0;

  @override
  Widget build(BuildContext context) {
    final pin = AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      width: selected ? size + 6 : size,
      height: selected ? size + 6 : size,
      decoration: BoxDecoration(
        color: faded ? color.withValues(alpha: 0.55) : color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: selected ? 3 : 2),
        boxShadow: const [BoxShadow(blurRadius: 4, color: Colors.black38, offset: Offset(0, 1))],
      ),
      child: Icon(icon, size: 18, color: Colors.white),
    );
    return Semantics(
      button: onTap != null,
      label: semanticLabel ?? label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            pin,
            if (label != null && label!.isNotEmpty)
              Container(
                margin: const EdgeInsets.only(top: 2),
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xxs, vertical: 1),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: faded ? 0.7 : 0.9),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  label!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.charcoal),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Marker so ausrichten, dass der Kreis (nicht die Beschriftung) auf dem Punkt liegt.
Marker pinMarker({required GeoPoint point, required Widget child, Key? key}) => Marker(
  key: key,
  point: toLatLng(point),
  width: MapPin.markerWidth,
  height: MapPin.markerHeight,
  alignment: const Alignment(0, 0.48),
  child: child,
);

/// Einrichtungen eines Reviers als Marker.
MarkerLayer waypointLayer(
  List<Waypoint> waypoints, {
  void Function(Waypoint w)? onTap,
  String? selectedId,
  bool faded = false,
  bool showLabels = true,
}) => MarkerLayer(
  markers: [
    for (final w in waypoints)
      pinMarker(
        key: ValueKey('waypoint-${w.id}'),
        point: w.location,
        child: MapPin(
          icon: w.category.icon,
          color: faded ? AppColors.slate : AppColors.forestMid,
          label: showLabels ? w.name : null,
          semanticLabel: '${w.category.label} ${w.name}',
          faded: faded,
          selected: w.id == selectedId,
          onTap: onTap == null ? null : () => onTap(w),
        ),
      ),
  ],
);

/// Ebenen für ein Polygon, das gerade gezeichnet wird.
List<Widget> drawingLayers(List<GeoPoint> points, {required Color color}) {
  if (points.isEmpty) return const [];
  final latLngs = [for (final p in points) toLatLng(p)];
  return [
    if (points.length >= 3)
      PolygonLayer<Object>(
        polygons: [Polygon<Object>(points: latLngs, color: color.withValues(alpha: 0.15))],
      ),
    PolylineLayer<Object>(
      polylines: [
        Polyline<Object>(points: [...latLngs, if (points.length >= 3) latLngs.first], color: color, strokeWidth: 3),
      ],
    ),
    MarkerLayer(
      markers: [
        for (var i = 0; i < points.length; i++)
          Marker(
            point: latLngs[i],
            width: 16,
            height: 16,
            child: Container(
              decoration: BoxDecoration(
                color: i == 0 ? color : Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: color, width: 3),
              ),
            ),
          ),
      ],
    ),
  ];
}

/// Leiste während des Zeichnens einer Fläche.
class DrawingBar extends StatelessWidget {
  const DrawingBar({
    super.key,
    required this.title,
    required this.pointCount,
    required this.onUndo,
    required this.onCancel,
    required this.onFinish,
    this.saving = false,
  });

  final String title;
  final int pointCount;
  final VoidCallback onUndo;
  final VoidCallback onCancel;
  final VoidCallback onFinish;
  final bool saving;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      elevation: 6,
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.xs, AppSpacing.sm),
        child: Row(
          children: [
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: theme.textTheme.titleSmall),
                  Text(
                    pointCount < 3
                        ? 'Tippe auf die Karte, um Eckpunkte zu setzen ($pointCount von mind. 3).'
                        : '$pointCount Eckpunkte – weiter tippen oder fertigstellen.',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Letzten Punkt entfernen',
              onPressed: pointCount == 0 || saving ? null : onUndo,
              icon: const Icon(Icons.undo),
            ),
            IconButton(tooltip: 'Abbrechen', onPressed: saving ? null : onCancel, icon: const Icon(Icons.close)),
            const SizedBox(width: AppSpacing.xxs),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
              onPressed: pointCount >= 3 && !saving ? onFinish : null,
              child: saving
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Fertig'),
            ),
          ],
        ),
      ),
    );
  }
}
