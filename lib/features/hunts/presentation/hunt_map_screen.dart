import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/routes.dart';
import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/geo/geo_point.dart';
import '../../../core/geo/geojson.dart';
import '../../../core/utils/validators.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../core/widgets/dialogs.dart';
import '../../../core/widgets/state_views.dart';
import '../../map/domain/revier_boundary.dart';
import '../../map/domain/waypoint.dart';
import '../../map/presentation/map_providers.dart';
import '../../map/presentation/widgets/app_map.dart';
import '../../map/presentation/widgets/map_layers.dart';
import '../../map/presentation/widgets/waypoint_sheets.dart';
import '../domain/hunt.dart';
import '../domain/hunt_enums.dart';
import '../domain/hunt_participant.dart';
import '../domain/hunt_permissions.dart';
import '../domain/hunt_stand.dart';
import '../domain/hunt_zone.dart';
import 'hunts_providers.dart';

/// Farbe einer Zone: eigene Farbe (`#RRGGBB`) oder Standard der Art.
Color zoneColor(HuntZone zone) {
  final hex = zone.color;
  if (hex != null && RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex)) {
    return Color(0xFF000000 | int.parse(hex.substring(1), radix: 16));
  }
  return switch (zone.kind) {
    HuntZoneKind.treiben => AppColors.moss,
    HuntZoneKind.sicherheitszone => AppColors.danger,
    HuntZoneKind.sperrzone => AppColors.danger,
    HuntZoneKind.sammelplatz => const Color(0xFF1E88E5),
    HuntZoneKind.sonstiges => AppColors.slate,
  };
}

/// Karte einer Jagd: Reviergrenze, Einrichtungen, Zonen, Stände, Treffpunkt.
/// Die Jagdleitung setzt hier Stände (lange drücken) und zeichnet Zonen.
class HuntMapScreen extends ConsumerWidget {
  const HuntMapScreen({super.key, required this.huntId});

  final String huntId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hunt = ref.watch(huntProvider(huntId));
    return Scaffold(
      appBar: AppBar(title: Text(hunt.value?.title ?? 'Jagdkarte')),
      body: AsyncValueView<Hunt>(
        value: hunt,
        onRetry: () => invalidateHunt(ref, huntId),
        data: (h) => _HuntMapLoader(hunt: h),
      ),
    );
  }
}

class _HuntMapLoader extends ConsumerWidget {
  const _HuntMapLoader({required this.hunt});

  final Hunt hunt;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final revierId = hunt.revierId;
    final values = <AsyncValue<Object?>>[
      ref.watch(huntStandsProvider(hunt.id)),
      ref.watch(huntZonesProvider(hunt.id)),
      ref.watch(huntParticipantsProvider(hunt.id)),
      ref.watch(huntPermissionsProvider(hunt.id)),
      if (revierId != null) ref.watch(revierBoundariesProvider(revierId)),
      if (revierId != null) ref.watch(revierWaypointsProvider(revierId)),
    ];
    final failed = values.where((v) => v.hasError).firstOrNull;
    if (failed != null) {
      return ErrorView(
        error: failed.error!,
        onRetry: () {
          invalidateHunt(ref, hunt.id);
          if (revierId != null) invalidateRevierMap(ref, revierId);
        },
      );
    }
    if (values.any((v) => !v.hasValue)) return const LoadingView();
    return HuntMapView(
      hunt: hunt,
      stands: ref.watch(huntStandsProvider(hunt.id)).value!,
      zones: ref.watch(huntZonesProvider(hunt.id)).value!,
      participants: ref.watch(huntParticipantsProvider(hunt.id)).value!,
      perms: ref.watch(huntPermissionsProvider(hunt.id)).value!,
      boundaries: revierId == null ? const [] : ref.watch(revierBoundariesProvider(revierId)).value!,
      waypoints: revierId == null ? const [] : ref.watch(revierWaypointsProvider(revierId)).value!,
    );
  }
}

class HuntMapView extends ConsumerStatefulWidget {
  const HuntMapView({
    super.key,
    required this.hunt,
    required this.stands,
    required this.zones,
    required this.participants,
    required this.perms,
    required this.boundaries,
    required this.waypoints,
  });

  final Hunt hunt;
  final List<HuntStand> stands;
  final List<HuntZone> zones;
  final List<HuntParticipant> participants;
  final HuntPermissions perms;
  final List<RevierBoundary> boundaries;
  final List<Waypoint> waypoints;

  @override
  ConsumerState<HuntMapView> createState() => _HuntMapViewState();
}

class _HuntMapViewState extends ConsumerState<HuntMapView> {
  final _controller = MapController();
  List<GeoPoint>? _drawing;
  bool _saving = false;
  String? _selectedStandId;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  List<GeoPolygon> get _boundary => [for (final b in widget.boundaries) ...b.polygons];

  List<GeoPoint> get _fitPoints {
    final points = [
      ...GeoJson.allPoints(_boundary),
      for (final z in widget.zones) ...GeoJson.allPoints(GeoJson.polygons(z.boundary)),
    ];
    if (points.isNotEmpty) return points;
    return [
      for (final s in widget.stands) s.location,
      if (widget.hunt.meetingLocation != null) widget.hunt.meetingLocation!,
      for (final w in widget.waypoints) w.location,
    ];
  }

  void _fitAll() {
    final bounds = GeoBounds.fromPoints(_fitPoints);
    if (bounds == null) return;
    _controller.fitCamera(
      CameraFit.bounds(bounds: toLatLngBounds(bounds), padding: const EdgeInsets.all(48), maxZoom: 17),
    );
  }

  void _onTap(GeoPoint point) {
    final drawing = _drawing;
    if (drawing != null) {
      setState(() => drawing.add(point));
      return;
    }
    // Oberste Zone zuerst (zuletzt gezeichnet).
    for (final z in widget.zones.reversed) {
      if (GeoJson.contains(GeoJson.polygons(z.boundary), point)) {
        _showZone(z);
        return;
      }
    }
  }

  void _onLongPress(GeoPoint point) {
    if (_drawing != null) return;
    if (!widget.perms.canManage) {
      showAppSnackBar(context, 'Stände setzt die Jagdleitung.');
      return;
    }
    context.push(Routes.standCreate(widget.hunt.id, at: point));
  }

  Future<void> _showStand(HuntStand stand) async {
    setState(() => _selectedStandId = stand.id);
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => _StandSheet(
        hunt: widget.hunt,
        stand: stand,
        perms: widget.perms,
        zone: widget.zones.where((z) => z.id == stand.zoneId).firstOrNull,
        assigned: widget.participants.where((p) => p.standId == stand.id).toList(),
      ),
    );
    if (mounted) setState(() => _selectedStandId = null);
  }

  Future<void> _showWaypoint(Waypoint w) => showWaypointDetails(
    context,
    waypoint: w,
    canEdit: false,
    extraActions: [
      if (widget.perms.canManage)
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: FilledButton.icon(
            onPressed: () {
              Navigator.of(context).pop();
              context.push(Routes.standCreate(widget.hunt.id, at: w.location, waypointId: w.id, label: w.name));
            },
            icon: const Icon(Icons.gps_fixed),
            label: const Text('Als Stand für diese Jagd übernehmen'),
          ),
        ),
    ],
  );

  Future<void> _showZone(HuntZone zone) => showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => _ZoneSheet(zone: zone, canManage: widget.perms.canManage),
  );

  Future<void> _finishZone() async {
    final result = await showModalBottomSheet<(String, HuntZoneKind)>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ZoneNameSheet(suggestedName: 'Treiben ${widget.zones.length + 1}'),
    );
    if (result == null || !mounted) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(huntsRepositoryProvider)
          .createZone(huntId: widget.hunt.id, name: result.$1, kind: result.$2, boundary: GeoJson.polygon(_drawing!));
      ref.invalidate(huntZonesProvider(widget.hunt.id));
      if (!mounted) return;
      setState(() => _drawing = null);
      showAppSnackBar(context, '„${result.$1}“ gespeichert.');
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final drawing = _drawing;
    final myStandId = widget.perms.participation?.standId;
    final meeting = widget.hunt.meetingLocation;
    final canManage = widget.perms.canManage;

    return Stack(
      children: [
        AppMap(
          controller: _controller,
          fitPoints: _fitPoints,
          bottomPadding: drawing != null ? 88 : 56,
          onTap: _onTap,
          onLongPress: _onLongPress,
          layers: [
            if (_boundary.isNotEmpty) polygonLayer(_boundary, color: revierBoundaryColor, fillOpacity: 0.03),
            for (final z in widget.zones)
              polygonLayer(
                GeoJson.polygons(z.boundary),
                color: zoneColor(z),
                fillOpacity: z.kind == HuntZoneKind.treiben ? 0.15 : 0.25,
                strokeWidth: 2,
                dashed: z.kind == HuntZoneKind.sperrzone,
                label: z.name,
              ),
            waypointLayer(
              widget.waypoints.where((w) => !widget.stands.any((s) => s.waypointId == w.id)).toList(),
              faded: true,
              showLabels: false,
              onTap: drawing == null ? _showWaypoint : null,
            ),
            MarkerLayer(
              markers: [
                if (meeting != null)
                  pinMarker(
                    point: meeting,
                    child: const MapPin(icon: Icons.flag_outlined, color: Color(0xFF1E88E5), label: 'Treffpunkt'),
                  ),
                for (final s in widget.stands)
                  pinMarker(
                    key: ValueKey('stand-${s.id}'),
                    point: s.location,
                    child: MapPin(
                      icon: s.id == myStandId ? Icons.star : Icons.gps_fixed,
                      color: s.id == myStandId ? AppColors.signalOrange : AppColors.forest,
                      label: s.label,
                      semanticLabel: s.id == myStandId ? 'Mein Stand ${s.label}' : s.label,
                      selected: s.id == _selectedStandId || s.id == myStandId,
                      onTap: drawing == null ? () => _showStand(s) : null,
                    ),
                  ),
              ],
            ),
            if (drawing != null) ...drawingLayers(drawing, color: AppColors.moss),
          ],
        ),
        Positioned(
          top: AppSpacing.sm,
          left: AppSpacing.sm,
          child: Material(
            color: Theme.of(context).colorScheme.surface,
            shape: const CircleBorder(),
            elevation: 3,
            child: PopupMenuButton<String>(
              tooltip: 'Kartenmenü',
              enabled: drawing == null,
              icon: Icon(Icons.layers_outlined, color: Theme.of(context).colorScheme.primary),
              onSelected: (v) => switch (v) {
                'fit' => _fitAll(),
                'zone' => setState(() => _drawing = []),
                'mine' => _showMine(),
                _ => null,
              },
              itemBuilder: (_) => [
                const PopupMenuItem(
                  value: 'fit',
                  child: ListTile(leading: Icon(Icons.fit_screen_outlined), title: Text('Alles zeigen')),
                ),
                if (myStandId != null)
                  const PopupMenuItem(
                    value: 'mine',
                    child: ListTile(leading: Icon(Icons.star_outline), title: Text('Zu meinem Stand')),
                  ),
                if (canManage)
                  const PopupMenuItem(
                    value: 'zone',
                    child: ListTile(leading: Icon(Icons.polyline_outlined), title: Text('Zone zeichnen')),
                  ),
              ],
            ),
          ),
        ),
        Positioned(
          left: drawing != null ? AppSpacing.sm : 56,
          right: drawing != null ? AppSpacing.sm : 56,
          bottom: AppSpacing.lg,
          child: drawing != null
              ? DrawingBar(
                  title: 'Zone zeichnen',
                  pointCount: drawing.length,
                  saving: _saving,
                  onUndo: () => setState(() => drawing.removeLast()),
                  onCancel: () => setState(() => _drawing = null),
                  onFinish: _finishZone,
                )
              : Align(
                  alignment: Alignment.bottomCenter,
                  child: Material(
                    elevation: 3,
                    color: Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
                      child: Text(
                        [
                          '${widget.stands.length} Stände',
                          '${widget.zones.length} Zonen',
                          if (canManage) 'lange drücken: Stand setzen',
                        ].join(' · '),
                        style: Theme.of(context).textTheme.bodySmall,
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                ),
        ),
      ],
    );
  }

  void _showMine() {
    final mine = widget.stands.where((s) => s.id == widget.perms.participation?.standId).firstOrNull;
    if (mine == null) return;
    _controller.move(toLatLng(mine.location), 17);
    _showStand(mine);
  }
}

class _StandSheet extends ConsumerWidget {
  const _StandSheet({
    required this.hunt,
    required this.stand,
    required this.perms,
    required this.zone,
    required this.assigned,
  });

  final Hunt hunt;
  final HuntStand stand;
  final HuntPermissions perms;
  final HuntZone? zone;
  final List<HuntParticipant> assigned;

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showConfirmDialog(
      context,
      title: '${stand.label} löschen?',
      message: 'Zugeteilte Schützen verlieren diesen Stand.',
      confirmLabel: 'Löschen',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(huntsRepositoryProvider).deleteStand(stand.id);
      invalidateHunt(ref, hunt.id);
      if (context.mounted) Navigator.of(context).pop();
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isMine = perms.participation?.standId == stand.id;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: CircleAvatar(
                backgroundColor: isMine ? AppColors.signalOrange : null,
                child: Icon(isMine ? Icons.star : Icons.gps_fixed, color: isMine ? Colors.white : null),
              ),
              title: Text(stand.label, style: theme.textTheme.titleLarge),
              subtitle: Text(
                [
                  if (isMine) 'Dein Stand',
                  if (assigned.isEmpty) 'nicht besetzt' else assigned.map((p) => p.name).join(', '),
                  if (zone != null) zone!.name,
                ].join(' · '),
              ),
            ),
            if (stand.description.isNotEmpty) ...[
              Text(stand.description, style: theme.textTheme.bodyMedium),
              const SizedBox(height: AppSpacing.sm),
            ],
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.my_location),
              title: Text(stand.location.format()),
              trailing: IconButton(
                tooltip: 'Koordinaten kopieren',
                icon: const Icon(Icons.copy),
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: stand.location.format()));
                  if (context.mounted) showAppSnackBar(context, 'Koordinaten kopiert.');
                },
              ),
            ),
            if (perms.canManage)
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Navigator.of(context).pop();
                        context.push(Routes.standEdit(hunt.id, stand.id));
                      },
                      icon: const Icon(Icons.edit_outlined),
                      label: const Text('Bearbeiten'),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
                      onPressed: () => _delete(context, ref),
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('Löschen'),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _ZoneSheet extends ConsumerWidget {
  const _ZoneSheet({required this.zone, required this.canManage});

  final HuntZone zone;
  final bool canManage;

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showConfirmDialog(
      context,
      title: '„${zone.name}“ löschen?',
      message: 'Zuteilungen zu dieser Zone werden aufgehoben.',
      confirmLabel: 'Löschen',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(huntsRepositoryProvider).deleteZone(zone.id);
      invalidateHunt(ref, zone.huntId);
      if (context.mounted) Navigator.of(context).pop();
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final ha = GeoJson.areaHectares(GeoJson.polygons(zone.boundary));
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: CircleAvatar(
                backgroundColor: zoneColor(zone),
                child: const Icon(Icons.layers_outlined, color: Colors.white),
              ),
              title: Text(zone.name, style: theme.textTheme.titleLarge),
              subtitle: Text('${zone.kind.label} · ${ha.toStringAsFixed(ha < 10 ? 1 : 0)} ha'),
            ),
            if (zone.description.isNotEmpty) Text(zone.description, style: theme.textTheme.bodyMedium),
            if (canManage)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
                  onPressed: () => _delete(context, ref),
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Zone löschen'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ZoneNameSheet extends StatefulWidget {
  const _ZoneNameSheet({required this.suggestedName});

  final String suggestedName;

  @override
  State<_ZoneNameSheet> createState() => _ZoneNameSheetState();
}

class _ZoneNameSheetState extends State<_ZoneNameSheet> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.suggestedName);
  HuntZoneKind _kind = HuntZoneKind.treiben;

  String _suggestion(HuntZoneKind k) => k == HuntZoneKind.treiben ? widget.suggestedName : k.label;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.lg),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Zone speichern', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: AppSpacing.sm),
              Wrap(
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                children: [
                  for (final k in HuntZoneKind.values)
                    ChoiceChip(
                      label: Text(k.label),
                      selected: k == _kind,
                      onSelected: (_) => setState(() {
                        final untouched = _name.text.isEmpty || _name.text == _suggestion(_kind);
                        _kind = k;
                        if (untouched) _name.text = _suggestion(k);
                      }),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                label: 'Name',
                controller: _name,
                prefixIcon: Icons.layers_outlined,
                maxLength: 120,
                textCapitalization: TextCapitalization.sentences,
                validator: Validators.zoneName,
              ),
              const SizedBox(height: AppSpacing.md),
              FilledButton.icon(
                onPressed: () {
                  if (!(_formKey.currentState?.validate() ?? false)) return;
                  Navigator.of(context).pop((_name.text.trim(), _kind));
                },
                icon: const Icon(Icons.check),
                label: const Text('Speichern'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
