import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/supabase_service.dart';
import '../data/supabase_reviere_repository.dart';
import '../domain/revier.dart';
import '../domain/reviere_repository.dart';

final reviereRepositoryProvider = Provider<ReviereRepository>(
  (ref) => SupabaseReviereRepository(ref.watch(supabaseClientProvider)),
);

final allReviereProvider = FutureProvider.autoDispose<List<Revier>>(
  (ref) => ref.watch(reviereRepositoryProvider).fetchAll(),
);

final groupReviereProvider = FutureProvider.autoDispose.family<List<Revier>, String>(
  (ref, groupId) => ref.watch(reviereRepositoryProvider).fetchForGroup(groupId),
);

final revierProvider = FutureProvider.autoDispose.family<Revier, String>(
  (ref, revierId) => ref.watch(reviereRepositoryProvider).fetchById(revierId),
);

void invalidateRevierData(WidgetRef ref, {required String groupId, String? revierId}) {
  ref.invalidate(allReviereProvider);
  ref.invalidate(groupReviereProvider(groupId));
  if (revierId != null) ref.invalidate(revierProvider(revierId));
}
