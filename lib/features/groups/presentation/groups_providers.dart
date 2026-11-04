import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/supabase_service.dart';
import '../../authentication/presentation/auth_providers.dart';
import '../data/supabase_groups_repository.dart';
import '../domain/group_invite.dart';
import '../domain/groups_repository.dart';
import '../domain/hunting_group.dart';

final groupsRepositoryProvider = Provider<GroupsRepository>(
  (ref) => SupabaseGroupsRepository(ref.watch(supabaseClientProvider)),
);

/// Alle Gruppen des angemeldeten Benutzers.
final myGroupsProvider = FutureProvider.autoDispose<List<MyGroup>>((ref) {
  final userId = ref.watch(currentUserIdProvider);
  return ref.watch(groupsRepositoryProvider).fetchMyGroups(userId);
});

/// Eine Gruppe inkl. eigener Rolle.
final myGroupProvider = FutureProvider.autoDispose.family<MyGroup, String>((ref, groupId) {
  final userId = ref.watch(currentUserIdProvider);
  return ref.watch(groupsRepositoryProvider).fetchMyGroup(userId: userId, groupId: groupId);
});

final groupMembersProvider = FutureProvider.autoDispose.family<List<GroupMember>, String>((ref, groupId) {
  return ref.watch(groupsRepositoryProvider).fetchMembers(groupId);
});

final groupInvitesProvider = FutureProvider.autoDispose.family<List<GroupInvite>, String>((ref, groupId) {
  return ref.watch(groupsRepositoryProvider).fetchInvites(groupId);
});

/// Lädt alle gruppenbezogenen Daten nach einer Änderung neu.
void invalidateGroupData(WidgetRef ref, {String? groupId}) {
  ref.invalidate(myGroupsProvider);
  if (groupId != null) {
    ref.invalidate(myGroupProvider(groupId));
    ref.invalidate(groupMembersProvider(groupId));
    ref.invalidate(groupInvitesProvider(groupId));
  }
}
