import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_spacing.dart';
import '../../../core/geo/geo_point.dart';
import '../../../core/geo/geojson.dart';
import '../../../core/widgets/dialogs.dart';
import '../../../core/widgets/state_views.dart';
import '../../hunting_grounds/domain/revier.dart';
import '../../hunting_grounds/presentation/reviere_providers.dart';
import '../domain/revier_boundary.dart';
import '../domain/waypoint.dart';
import 'map_providers.dart';
import 'widgets/app_map.dart';
import 'widgets/map_layers.dart';
import 'widgets/waypoint_sheets.dart';

/// Tab „Karte“: Revierkarte mit Grenze und Einrichtungen.
class MapScreen extends ConsumerWidget {
  const MapScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviere = ref.watch(allReviereProvider);
    final selectedId = ref.watch(selectedRevierIdProvider);
    final list = reviere.value ?? const <Revier>[];
    final revier = list.where((r) => r.id == selectedId).firstOrNull ?? list.firstOrNull;

    return Scaffold(
      appBar: AppBar(
        title: list.length > 1 && revier != null
            ? _RevierPicker(reviere: list, selected: revier)
            : Text(revier?.name ?? 'Karte'),
      ),
      body: AsyncValueView<List<Revier>>(
        value: reviere,
        onRetry: () => ref.invalidate(allReviereProvider),
        data: (_) => revier == null
            ? const Center(
                child: EmptyState(
                  icon: Icons.map_outlined,
                  title: 'Noch kein Revier',
                  message: 'Lege in deiner Gruppe ein Revier an. Danach erscheint hier die Revierkarte.',
                ),
              )
            : _RevierMapLoader(key: ValueKey(revier.id), revier: revier),
      ),
    );
  }
}

class _RevierPicker extends ConsumerWidget {
  const _RevierPicker({required this.reviere, required this.selected});

  final List<Revier> reviere;
  final Revier selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DropdownButtonHideUnderline(
      child: DropdownButton<String>(
        value: selected.id,
        isExpanded: true,
        style: Theme.of(context).textTheme.titleLarge,
        items: [
          for (final r in reviere)
            DropdownMenuItem(
              value: r.id,
              child: Text(r.groupName == null ? r.name : '${r.name} · ${r.groupName}', overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (id) => ref.read(selectedRevierIdProvider.notifier).select(id),
      ),
    );
  }
}

/// Wartet auf Grenze und Einrichtungen, damit die Karte gleich passend startet.
class _RevierMapLoader extends ConsumerWidget {
  const _RevierMapLoader({super.key, required this.revier});

  final Revier revier;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final boundaries = ref.watch(revierBoundariesProvider(revier.id));
    final waypoints = ref.watch(revierWaypointsProvider(revier.id));
    if (boundaries.hasError || waypoints.hasError) {
      return ErrorView(
        error: (boundaries.error ?? waypoints.error)!,
        onRetry: () => invalidateRevierMap(ref, revier.id),
      );
    }
    if (!boundaries.hasValue || !waypoints.hasValue) return const LoadingView();
    return RevierMapView(revier: revier, boundaries: boundaries.value!, waypoints: waypoints.value!);
  }
}

/// Karte eines Reviers mit Bearbeitung für Berechtigte.
class RevierMapView extends ConsumerStatefulWidget {
  const RevierMapView({super.key, required this.revier, required this.boundaries, required this.waypoints});

  final Revier revier;
  final List<RevierBoundary> boundaries;
  final List<Waypoint> waypoints;

  @override
  ConsumerState<RevierMapView> createState() => _RevierMapViewState();
}

class _RevierMapViewState extends ConsumerState<RevierMapView> {
  final _controller = MapController();

  /// Eckpunkte beim Zeichnen der Reviergrenze (`null` = nicht im Zeichenmodus).
  List<GeoPoint>? _drawing;
  bool _saving = false;
  String? _selectedWaypointId;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  List<GeoPolygon> get _polygons => [for (final b in widget.boundaries) ...b.polygons];

  List<GeoPoint> get _fitPoints {
    final boundary = GeoJson.allPoints(_polygons).toList();
    return boundary.isNotEmpty ? boundary : [for (final w in widget.waypoints) w.location];
  }

  void _fitRevier() {
    final bounds = GeoBounds.fromPoints(_fitPoints);
    if (bounds == null) return;
    _controller.fitCamera(
      CameraFit.bounds(bounds: toLatLngBounds(bounds), padding: const EdgeInsets.all(48), maxZoom: 17),
    );
  }

  Future<void> _onLongPress(GeoPoint point, RevierMapPermissions perms) async {
    if (_drawing != null) return;
    if (!perms.canEditRevier) {
      showAppSnackBar(context, 'Einrichtungen legen Owner und Admins der Gruppe an.');
      return;
    }
    final saved = await showWaypointForm(context, revierId: widget.revier.id, point: point);
    if (saved != null && mounted) setState(() => _selectedWaypointId = saved.id);
  }

  Future<void> _showWaypoint(Waypoint w, RevierMapPermissions perms) async {
    setState(() => _selectedWaypointId = w.id);
    await showWaypointDetails(context, waypoint: w, canEdit: perms.canEditWaypoint(w));
    if (mounted) setState(() => _selectedWaypointId = null);
  }

  Future<void> _saveBoundary() async {
    final points = _drawing!;
    final replaces = widget.boundaries.isNotEmpty;
    if (replaces) {
      final ok = await showConfirmDialog(
        context,
        title: 'Reviergrenze ersetzen?',
        message: 'Die bisherige Grenze wird durch die neu gezeichnete ersetzt.',
        confirmLabel: 'Ersetzen',
      );
      if (!ok || !mounted) return;
    }
    setState(() => _saving = true);
    try {
      final saved = await ref
          .read(revierMapRepositoryProvider)
          .replaceBoundary(revierId: widget.revier.id, geojson: GeoJson.polygon(points));
      ref.invalidate(revierBoundariesProvider(widget.revier.id));
      if (!mounted) return;
      setState(() => _drawing = null);
      showAppSnackBar(context, 'Reviergrenze gespeichert (${_formatHa(saved.areaHectares)}).');
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _deleteBoundary() async {
    final ok = await showConfirmDialog(
      context,
      title: 'Reviergrenze löschen?',
      message: 'Die Grenze von „${widget.revier.name}“ wird entfernt. Einrichtungen bleiben erhalten.',
      confirmLabel: 'Löschen',
      destructive: true,
    );
    if (!ok || !mounted) return;
    try {
      await ref.read(revierMapRepositoryProvider).deleteBoundaries(widget.revier.id);
      ref.invalidate(revierBoundariesProvider(widget.revier.id));
      if (mounted) showAppSnackBar(context, 'Reviergrenze gelöscht.');
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final perms =
        ref.watch(revierMapPermissionsProvider(widget.revier.id)).value ??
        const RevierMapPermissions(userId: null, canEditRevier: false);
    final drawing = _drawing;
    final polygons = _polygons;

    return Stack(
      children: [
        AppMap(
          controller: _controller,
          fitPoints: _fitPoints,
          bottomPadding: drawing != null ? 88 : 56,
          onTap: drawing == null ? null : (p) => setState(() => drawing.add(p)),
          onLongPress: (p) => _onLongPress(p, perms),
          layers: [
            if (polygons.isNotEmpty) polygonLayer(polygons, color: revierBoundaryColor),
            waypointLayer(
              widget.waypoints,
              selectedId: _selectedWaypointId,
              onTap: drawing == null ? (w) => _showWaypoint(w, perms) : null,
            ),
            if (drawing != null) ...drawingLayers(drawing, color: revierBoundaryColor),
          ],
        ),
        Positioned(
          top: AppSpacing.sm,
          left: AppSpacing.sm,
          child: _MapMenu(
            canEdit: perms.canEditRevier,
            hasBoundary: polygons.isNotEmpty,
            drawing: drawing != null,
            onFit: _fitPoints.isEmpty ? null : _fitRevier,
            onDraw: () => setState(() => _drawing = []),
            onDelete: _deleteBoundary,
          ),
        ),
        Positioned(
          left: drawing != null ? AppSpacing.sm : 56,
          right: drawing != null ? AppSpacing.sm : 56,
          bottom: AppSpacing.lg,
          child: drawing != null
              ? DrawingBar(
                  title: 'Reviergrenze zeichnen',
                  pointCount: drawing.length,
                  saving: _saving,
                  onUndo: () => setState(() => drawing.removeLast()),
                  onCancel: () => setState(() => _drawing = null),
                  onFinish: _saveBoundary,
                )
              : Align(
                  alignment: Alignment.bottomCenter,
                  child: _InfoChip(
                    text: [
                      if (polygons.isNotEmpty) _formatHa(GeoJson.areaHectares(polygons)) else 'Keine Grenze',
                      '${widget.waypoints.length} Einrichtungen',
                      if (perms.canEditRevier) 'lange drücken: neue Einrichtung',
                    ].join(' · '),
                  ),
                ),
        ),
      ],
    );
  }
}

String _formatHa(double ha) => '${ha.round()} ha';

class _MapMenu extends StatelessWidget {
  const _MapMenu({
    required this.canEdit,
    required this.hasBoundary,
    required this.drawing,
    required this.onFit,
    required this.onDraw,
    required this.onDelete,
  });

  final bool canEdit;
  final bool hasBoundary;
  final bool drawing;
  final VoidCallback? onFit;
  final VoidCallback onDraw;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      shape: const CircleBorder(),
      elevation: 3,
      child: PopupMenuButton<String>(
        tooltip: 'Kartenmenü',
        icon: Icon(Icons.layers_outlined, color: scheme.primary),
        enabled: !drawing,
        onSelected: (v) => switch (v) {
          'fit' => onFit?.call(),
          'draw' => onDraw(),
          'delete' => onDelete(),
          _ => null,
        },
        itemBuilder: (_) => [
          PopupMenuItem(
            value: 'fit',
            enabled: onFit != null,
            child: const ListTile(leading: Icon(Icons.fit_screen_outlined), title: Text('Ganzes Revier zeigen')),
          ),
          if (canEdit)
            PopupMenuItem(
              value: 'draw',
              child: ListTile(
                leading: const Icon(Icons.polyline_outlined),
                title: Text(hasBoundary ? 'Reviergrenze neu zeichnen' : 'Reviergrenze zeichnen'),
              ),
            ),
          if (canEdit && hasBoundary)
            const PopupMenuItem(
              value: 'delete',
              child: ListTile(leading: Icon(Icons.delete_outline), title: Text('Reviergrenze löschen')),
            ),
        ],
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      elevation: 3,
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
        child: Text(text, style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
      ),
    );
  }
}
