import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/supabase_service.dart';
import '../../authentication/presentation/auth_providers.dart';
import '../../groups/domain/group_role.dart';
import '../../groups/presentation/groups_providers.dart';
import '../data/supabase_hunts_repository.dart';
import '../domain/hunt.dart';
import '../domain/hunt_participant.dart';
import '../domain/hunt_permissions.dart';
import '../domain/hunt_report.dart';
import '../domain/hunt_stand.dart';
import '../domain/hunt_zone.dart';
import '../domain/hunts_repository.dart';

final huntsRepositoryProvider = Provider<HuntsRepository>(
  (ref) => SupabaseHuntsRepository(ref.watch(supabaseClientProvider)),
);

final allHuntsProvider = FutureProvider.autoDispose<List<Hunt>>((ref) => ref.watch(huntsRepositoryProvider).fetchAll());

final groupHuntsProvider = FutureProvider.autoDispose.family<List<Hunt>, String>(
  (ref, groupId) => ref.watch(huntsRepositoryProvider).fetchForGroup(groupId),
);

final huntProvider = FutureProvider.autoDispose.family<Hunt, String>(
  (ref, huntId) => ref.watch(huntsRepositoryProvider).fetchById(huntId),
);

final huntParticipantsProvider = FutureProvider.autoDispose.family<List<HuntParticipant>, String>(
  (ref, huntId) => ref.watch(huntsRepositoryProvider).fetchParticipants(huntId),
);

final huntZonesProvider = FutureProvider.autoDispose.family<List<HuntZone>, String>(
  (ref, huntId) => ref.watch(huntsRepositoryProvider).fetchZones(huntId),
);

final huntStandsProvider = FutureProvider.autoDispose.family<List<HuntStand>, String>(
  (ref, huntId) => ref.watch(huntsRepositoryProvider).fetchStands(huntId),
);

final huntReportsProvider = FutureProvider.autoDispose.family<List<HuntReport>, String>(
  (ref, huntId) => ref.watch(huntsRepositoryProvider).fetchReports(huntId),
);

/// Eigene Rechte in einer Jagd (Gruppenrolle + eigene Teilnahme).
final huntPermissionsProvider = FutureProvider.autoDispose.family<HuntPermissions, String>((ref, huntId) async {
  final userId = ref.watch(currentUserIdProvider);
  final hunt = await ref.watch(huntProvider(huntId).future);
  final participants = await ref.watch(huntParticipantsProvider(huntId).future);
  GroupRole? role;
  try {
    role = (await ref.watch(myGroupProvider(hunt.groupId).future)).role;
  } on Object {
    role = null;
  }
  return HuntPermissions(
    userId: userId,
    groupRole: role,
    participation: participants.where((p) => p.userId == userId).firstOrNull,
  );
});

/// Lädt alle Daten einer Jagd nach einer Änderung neu.
void invalidateHunt(WidgetRef ref, String huntId, {String? groupId}) {
  ref
    ..invalidate(huntProvider(huntId))
    ..invalidate(huntParticipantsProvider(huntId))
    ..invalidate(huntStandsProvider(huntId))
    ..invalidate(huntZonesProvider(huntId))
    ..invalidate(huntReportsProvider(huntId))
    ..invalidate(huntPermissionsProvider(huntId))
    ..invalidate(allHuntsProvider);
  if (groupId != null) ref.invalidate(groupHuntsProvider(groupId));
}
