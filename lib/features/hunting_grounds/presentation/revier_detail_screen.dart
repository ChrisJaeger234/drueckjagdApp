import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/routes.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/dialogs.dart';
import '../../../core/widgets/layout.dart';
import '../../../core/widgets/state_views.dart';
import '../../groups/presentation/groups_providers.dart';
import '../../../core/geo/geojson.dart';
import '../../map/domain/revier_boundary.dart';
import '../../map/domain/waypoint.dart';
import '../../map/domain/waypoint_category.dart';
import '../../map/presentation/map_providers.dart';
import '../domain/revier.dart';
import 'reviere_providers.dart';

class RevierDetailScreen extends ConsumerWidget {
  const RevierDetailScreen({super.key, required this.groupId, required this.revierId});

  final String groupId;
  final String revierId;

  Future<void> _delete(BuildContext context, WidgetRef ref, Revier revier) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Revier löschen?',
      message: '„${revier.name}“ und alle zugehörigen Daten werden unwiderruflich gelöscht.',
      confirmLabel: 'Löschen',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(reviereRepositoryProvider).delete(revier.id);
      invalidateRevierData(ref, groupId: groupId);
      if (!context.mounted) return;
      showAppSnackBar(context, 'Revier wurde gelöscht.');
      context.pop();
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final revier = ref.watch(revierProvider(revierId));
    final perms = ref.watch(myGroupProvider(groupId)).value?.permissions;

    return Scaffold(
      appBar: AppBar(
        title: Text(revier.value?.name ?? 'Revier'),
        actions: [
          if (perms?.canEditRevier ?? false)
            IconButton(
              tooltip: 'Bearbeiten',
              icon: const Icon(Icons.edit_outlined),
              onPressed: () => context.push(Routes.revierEdit(groupId, revierId)),
            ),
          if ((perms?.canDeleteRevier ?? false) && revier.value != null)
            IconButton(
              tooltip: 'Löschen',
              icon: const Icon(Icons.delete_outline),
              onPressed: () => _delete(context, ref, revier.value!),
            ),
        ],
      ),
      body: AsyncValueView<Revier>(
        value: revier,
        onRetry: () => ref.invalidate(revierProvider(revierId)),
        data: (r) => PageBody(
          children: [
            SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(r.name, style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: AppSpacing.xxs),
                  if (r.groupName != null)
                    InkWell(
                      onTap: () => context.push(Routes.group(r.groupId)),
                      child: Row(
                        children: [
                          const Icon(Icons.groups_outlined, size: 18),
                          const SizedBox(width: AppSpacing.xxs),
                          Text(r.groupName!),
                        ],
                      ),
                    ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    r.description.isEmpty ? 'Keine Beschreibung hinterlegt.' : r.description,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Angelegt am ${Formatters.date(r.createdAt)} · zuletzt geändert ${Formatters.dateTime(r.updatedAt)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            _RevierMapCard(revierId: r.id),
          ],
        ),
      ),
    );
  }
}

class _RevierMapCard extends ConsumerWidget {
  const _RevierMapCard({required this.revierId});

  final String revierId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final boundaries = ref.watch(revierBoundariesProvider(revierId)).value;
    final waypoints = ref.watch(revierWaypointsProvider(revierId)).value;
    final polygons = [for (final b in boundaries ?? const <RevierBoundary>[]) ...b.polygons];
    final counts = <WaypointCategory, int>{};
    for (final w in waypoints ?? const <Waypoint>[]) {
      counts[w.category] = (counts[w.category] ?? 0) + 1;
    }
    return SectionCard(
      title: 'Karte & Einrichtungen',
      icon: Icons.map_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            boundaries == null
                ? 'Lade Kartendaten …'
                : [
                    if (polygons.isEmpty)
                      'Noch keine Reviergrenze'
                    else
                      'Reviergrenze ${GeoJson.areaHectares(polygons).round()} ha',
                    '${waypoints?.length ?? 0} Einrichtungen',
                  ].join(' · '),
            style: theme.textTheme.bodyMedium,
          ),
          if (counts.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                for (final c in WaypointCategory.values)
                  if (counts[c] case final n?) Chip(avatar: Icon(c.icon, size: 18), label: Text('${c.label} $n')),
              ],
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          FilledButton.tonalIcon(
            onPressed: () {
              ref.read(selectedRevierIdProvider.notifier).select(revierId);
              context.go(Routes.map);
            },
            icon: const Icon(Icons.map_outlined),
            label: const Text('Auf der Karte öffnen'),
          ),
        ],
      ),
    );
  }
}
