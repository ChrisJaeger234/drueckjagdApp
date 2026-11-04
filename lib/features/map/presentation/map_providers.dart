import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/location_service.dart';
import '../../../core/services/supabase_service.dart';
import '../../authentication/presentation/auth_providers.dart';
import '../../groups/presentation/groups_providers.dart';
import '../../hunting_grounds/presentation/reviere_providers.dart';
import '../data/supabase_revier_map_repository.dart';
import '../domain/revier_boundary.dart';
import '../domain/revier_map_repository.dart';
import '../domain/waypoint.dart';
import 'map_style.dart';

final revierMapRepositoryProvider = Provider<RevierMapRepository>(
  (ref) => SupabaseRevierMapRepository(ref.watch(supabaseClientProvider)),
);

final locationServiceProvider = Provider<LocationService>((ref) => const GeolocatorLocationService());

/// Kartenkacheln laden? In Widget-Tests aus, weil dort kein Netz verfügbar ist.
final mapTilesEnabledProvider = Provider<bool>((ref) => true);

final revierBoundariesProvider = FutureProvider.autoDispose.family<List<RevierBoundary>, String>(
  (ref, revierId) => ref.watch(revierMapRepositoryProvider).fetchBoundaries(revierId),
);

final revierWaypointsProvider = FutureProvider.autoDispose.family<List<Waypoint>, String>(
  (ref, revierId) => ref.watch(revierMapRepositoryProvider).fetchWaypoints(revierId),
);

/// Rechte auf der Karte eines Reviers (spiegelt die RLS-Regeln).
class RevierMapPermissions {
  const RevierMapPermissions({required this.userId, required this.canEditRevier});

  final String? userId;

  /// Owner/Admin: Grenze ändern, Einrichtungen anlegen.
  final bool canEditRevier;

  bool canEditWaypoint(Waypoint w) => canEditRevier || (userId != null && w.createdBy == userId);
}

final revierMapPermissionsProvider = FutureProvider.autoDispose.family<RevierMapPermissions, String>((
  ref,
  revierId,
) async {
  final userId = ref.watch(currentUserIdProvider);
  final revier = await ref.watch(revierProvider(revierId).future);
  var canEdit = false;
  try {
    canEdit = (await ref.watch(myGroupProvider(revier.groupId).future)).permissions.canEditRevier;
  } on Object {
    canEdit = false;
  }
  return RevierMapPermissions(userId: userId, canEditRevier: canEdit);
});

/// Im Tab „Karte“ gewähltes Revier (`null` = erstes verfügbares).
class SelectedRevierNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void select(String? revierId) => state = revierId;
}

final selectedRevierIdProvider = NotifierProvider<SelectedRevierNotifier, String?>(SelectedRevierNotifier.new);

/// Gewählter Kartenstil (für alle Karten der App).
class MapStyleNotifier extends Notifier<MapStyle> {
  @override
  MapStyle build() => MapStyle.outdoors;

  void select(MapStyle style) => state = style;
}

final mapStyleProvider = NotifierProvider<MapStyleNotifier, MapStyle>(MapStyleNotifier.new);

void invalidateRevierMap(WidgetRef ref, String revierId) {
  ref
    ..invalidate(revierBoundariesProvider(revierId))
    ..invalidate(revierWaypointsProvider(revierId));
}
