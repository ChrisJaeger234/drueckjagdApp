import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../../../app/theme/app_spacing.dart';
import '../../../../core/constants/app_constants.dart';
import '../../../../core/geo/geo_point.dart';
import '../../../../core/geo/geojson.dart';
import '../../../../core/services/location_service.dart';
import '../../../../core/services/supabase_service.dart';
import '../../../../core/widgets/dialogs.dart';
import '../map_providers.dart';
import '../map_style.dart';

LatLng toLatLng(GeoPoint p) => LatLng(p.latitude, p.longitude);

GeoPoint toGeoPoint(LatLng p) => GeoPoint(p.latitude, p.longitude);

LatLngBounds toLatLngBounds(GeoBounds b) => LatLngBounds(LatLng(b.south, b.west), LatLng(b.north, b.east));

/// Gemeinsame Kartenbasis: Hintergrund (Mapbox bzw. OSM), Stilwahl,
/// eigener Standort und Quellenangabe. Inhalte kommen über [layers].
class AppMap extends ConsumerStatefulWidget {
  const AppMap({
    super.key,
    required this.controller,
    this.layers = const [],
    this.fitPoints = const [],
    this.onTap,
    this.onLongPress,
    this.bottomPadding = 0,
  });

  final MapController controller;

  /// Ebenen über dem Hintergrund (Polygone, Marker …).
  final List<Widget> layers;

  /// Punkte, auf die die Karte beim Start ausgerichtet wird
  /// (leer: Startansicht aus [AppConstants]).
  final List<GeoPoint> fitPoints;

  final void Function(GeoPoint point)? onTap;
  final void Function(GeoPoint point)? onLongPress;

  /// Platz unten für eingeblendete Leisten, damit Knöpfe frei bleiben.
  final double bottomPadding;

  @override
  ConsumerState<AppMap> createState() => _AppMapState();
}

class _AppMapState extends ConsumerState<AppMap> {
  DevicePosition? _position;
  StreamSubscription<DevicePosition>? _positionSub;
  bool _locating = false;

  @override
  void dispose() {
    _positionSub?.cancel();
    super.dispose();
  }

  CameraFit? get _initialFit {
    final bounds = GeoBounds.fromPoints(widget.fitPoints);
    if (bounds == null || widget.fitPoints.length < 2) return null;
    return CameraFit.bounds(bounds: toLatLngBounds(bounds), padding: const EdgeInsets.all(48), maxZoom: 17);
  }

  Future<void> _locate() async {
    if (_locating) return;
    setState(() => _locating = true);
    final service = ref.read(locationServiceProvider);
    try {
      final pos = await service.current();
      if (!mounted) return;
      setState(() => _position = pos);
      final zoom = widget.controller.camera.zoom < 15 ? 15.0 : widget.controller.camera.zoom;
      widget.controller.move(toLatLng(pos.point), zoom);
      _positionSub ??= service.watch().listen((p) {
        if (mounted) setState(() => _position = p);
      }, onError: (Object _) {});
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final style = ref.watch(mapStyleProvider);
    final tilesEnabled = ref.watch(mapTilesEnabledProvider);
    final token = ref.watch(appConfigProvider).mapboxAccessToken;
    final source = MapTileSource.forStyle(style, mapboxToken: token);
    final scheme = Theme.of(context).colorScheme;
    final single = widget.fitPoints.length == 1 ? widget.fitPoints.first : null;

    return Stack(
      children: [
        FlutterMap(
          mapController: widget.controller,
          options: MapOptions(
            initialCenter: toLatLng(single ?? AppConstants.defaultMapCenter),
            initialZoom: single != null ? 16 : AppConstants.defaultMapZoom,
            initialCameraFit: _initialFit,
            minZoom: 4,
            maxZoom: 19,
            backgroundColor: scheme.surfaceContainerHighest,
            interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
            onTap: widget.onTap == null ? null : (_, p) => widget.onTap!(toGeoPoint(p)),
            onLongPress: widget.onLongPress == null ? null : (_, p) => widget.onLongPress!(toGeoPoint(p)),
          ),
          children: [
            if (tilesEnabled)
              TileLayer(
                urlTemplate: source.urlTemplate,
                tileDimension: source.tileDimension,
                zoomOffset: source.zoomOffset,
                maxNativeZoom: source.isMapbox ? 22 : 19,
                userAgentPackageName: 'de.drueckjagd.app',
              ),
            ...widget.layers,
            if (_position != null) ..._positionLayers(_position!),
            RichAttributionWidget(
              alignment: AttributionAlignment.bottomLeft,
              showFlutterMapAttribution: false,
              attributions: [for (final a in source.attribution) TextSourceAttribution(a)],
            ),
          ],
        ),
        Positioned(
          top: AppSpacing.sm,
          right: AppSpacing.sm,
          child: _MapButton(
            tooltip: style == MapStyle.outdoors ? 'Luftbild zeigen' : 'Geländekarte zeigen',
            icon: style == MapStyle.outdoors ? MapStyle.satellite.icon : MapStyle.outdoors.icon,
            onPressed: () => ref
                .read(mapStyleProvider.notifier)
                .select(style == MapStyle.outdoors ? MapStyle.satellite : MapStyle.outdoors),
          ),
        ),
        Positioned(
          right: AppSpacing.sm,
          bottom: AppSpacing.lg + widget.bottomPadding,
          child: _MapButton(
            tooltip: 'Mein Standort',
            icon: _position == null ? Icons.my_location_outlined : Icons.my_location,
            loading: _locating,
            onPressed: _locate,
          ),
        ),
      ],
    );
  }
}

class _MapButton extends StatelessWidget {
  const _MapButton({required this.tooltip, required this.icon, required this.onPressed, this.loading = false});

  final String tooltip;
  final IconData icon;
  final VoidCallback onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      shape: const CircleBorder(),
      elevation: 3,
      child: IconButton(
        tooltip: tooltip,
        onPressed: loading ? null : onPressed,
        icon: loading
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
            : Icon(icon, color: scheme.primary),
      ),
    );
  }
}

List<Widget> _positionLayers(DevicePosition position) {
  const blue = Color(0xFF1E88E5);
  final point = toLatLng(position.point);
  final accuracy = position.accuracy;
  return [
    if (accuracy != null && accuracy > 0)
      CircleLayer(
        circles: [
          CircleMarker(
            point: point,
            radius: accuracy,
            useRadiusInMeter: true,
            color: blue.withValues(alpha: 0.12),
            borderColor: blue.withValues(alpha: 0.4),
            borderStrokeWidth: 1,
          ),
        ],
      ),
    MarkerLayer(
      markers: [
        Marker(
          point: point,
          width: 22,
          height: 22,
          child: Container(
            decoration: BoxDecoration(
              color: blue,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 3),
              boxShadow: const [BoxShadow(blurRadius: 4, color: Colors.black26)],
            ),
          ),
        ),
      ],
    ),
  ];
}
