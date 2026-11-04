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
import '../../map/domain/waypoint_category.dart';
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
            SectionCard(
              title: 'Karte & Reviergrenzen',
              icon: Icons.map_outlined,
              trailing: const _PhaseChip(),
              child: Text(
                'Die Reviergrenze (Import aus KML/GPX oder Zeichnen auf der Karte) folgt mit der Kartenintegration.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            SectionCard(
              title: 'Jagdliche Einrichtungen',
              icon: Icons.place_outlined,
              trailing: const _PhaseChip(),
              child: Wrap(
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                children: [
                  for (final c in WaypointCategory.values) Chip(avatar: Icon(c.icon, size: 18), label: Text(c.label)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhaseChip extends StatelessWidget {
  const _PhaseChip();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs, vertical: 2),
      decoration: BoxDecoration(
        color: scheme.tertiaryContainer,
        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
      ),
      child: Text(
        'Phase 2',
        style: TextStyle(color: scheme.onTertiaryContainer, fontSize: 12, fontWeight: FontWeight.w700),
      ),
    );
  }
}
