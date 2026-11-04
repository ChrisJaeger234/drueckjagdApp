import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/routes.dart';
import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/dialogs.dart';
import '../../../core/widgets/layout.dart';
import '../../../core/widgets/state_views.dart';
import '../../../core/widgets/user_avatar.dart';
import '../../groups/domain/hunting_group.dart';
import '../../groups/presentation/groups_providers.dart';
import '../domain/hunt.dart';
import '../domain/hunt_enums.dart';
import '../domain/hunt_participant.dart';
import '../domain/hunt_permissions.dart';
import '../domain/hunt_report.dart';
import '../domain/hunt_stand.dart';
import '../domain/hunt_zone.dart';
import 'hunts_providers.dart';
import 'widgets/hunt_tile.dart';
import 'widgets/report_sheet.dart';

enum _HuntAction { edit, start, finish, cancel, delete }

/// Alles zu einer Jagd auf einer Seite: Infos, eigene Teilnahme mit Stand,
/// Schnellmeldungen, Meldungen, Stände und Teilnehmer.
class HuntDetailScreen extends ConsumerWidget {
  const HuntDetailScreen({super.key, required this.huntId});

  final String huntId;

  Future<void> _onAction(BuildContext context, WidgetRef ref, Hunt hunt, _HuntAction action) async {
    final repo = ref.read(huntsRepositoryProvider);
    try {
      switch (action) {
        case _HuntAction.edit:
          await context.push(Routes.huntEdit(huntId));
          return;
        case _HuntAction.start:
          await repo.setStatus(huntId: huntId, status: HuntStatus.laufend);
        case _HuntAction.finish:
          final ok = await showConfirmDialog(
            context,
            title: 'Jagd beenden?',
            message: 'Danach kann sich niemand mehr selbst eintragen. Meldungen bleiben möglich.',
            confirmLabel: 'Beenden',
          );
          if (!ok) return;
          await repo.setStatus(huntId: huntId, status: HuntStatus.beendet);
        case _HuntAction.cancel:
          final ok = await showConfirmDialog(
            context,
            title: 'Jagd absagen?',
            message: 'Alle Teilnehmer sehen die Jagd als abgesagt.',
            confirmLabel: 'Absagen',
            destructive: true,
          );
          if (!ok) return;
          await repo.setStatus(huntId: huntId, status: HuntStatus.abgesagt);
        case _HuntAction.delete:
          final ok = await showConfirmDialog(
            context,
            title: 'Jagd endgültig löschen?',
            message: 'Zonen, Stände, Teilnehmer und alle Meldungen dieser Jagd werden gelöscht.',
            confirmLabel: 'Löschen',
            destructive: true,
          );
          if (!ok) return;
          await repo.delete(huntId);
          invalidateHunt(ref, huntId, groupId: hunt.groupId);
          if (!context.mounted) return;
          showAppSnackBar(context, 'Jagd wurde gelöscht.');
          context.pop();
          return;
      }
      invalidateHunt(ref, huntId, groupId: hunt.groupId);
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final huntValue = ref.watch(huntProvider(huntId));
    final perms = ref.watch(huntPermissionsProvider(huntId)).value;
    final hunt = huntValue.value;

    return Scaffold(
      appBar: AppBar(
        title: Text(hunt?.title ?? 'Jagd'),
        actions: [
          if (hunt != null && perms != null && perms.canManage)
            PopupMenuButton<_HuntAction>(
              tooltip: 'Jagd verwalten',
              onSelected: (a) => _onAction(context, ref, hunt, a),
              itemBuilder: (_) => [
                const PopupMenuItem(value: _HuntAction.edit, child: Text('Bearbeiten')),
                if (hunt.status == HuntStatus.geplant)
                  const PopupMenuItem(value: _HuntAction.start, child: Text('Jagd starten')),
                if (hunt.status == HuntStatus.laufend)
                  const PopupMenuItem(value: _HuntAction.finish, child: Text('Jagd beenden')),
                if (hunt.status.isOpen) const PopupMenuItem(value: _HuntAction.cancel, child: Text('Jagd absagen')),
                if (perms.canDelete) const PopupMenuItem(value: _HuntAction.delete, child: Text('Jagd löschen')),
              ],
            ),
        ],
      ),
      body: AsyncValueView<Hunt>(
        value: huntValue,
        onRetry: () => invalidateHunt(ref, huntId),
        data: (hunt) => RefreshIndicator(
          onRefresh: () async {
            invalidateHunt(ref, huntId, groupId: hunt.groupId);
            await ref.read(huntProvider(huntId).future);
          },
          child: _HuntBody(hunt: hunt),
        ),
      ),
    );
  }
}

class _HuntBody extends ConsumerWidget {
  const _HuntBody({required this.hunt});

  final Hunt hunt;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final perms = ref.watch(huntPermissionsProvider(hunt.id));
    final participants = ref.watch(huntParticipantsProvider(hunt.id)).value ?? const <HuntParticipant>[];
    final stands = ref.watch(huntStandsProvider(hunt.id)).value ?? const <HuntStand>[];
    final zones = ref.watch(huntZonesProvider(hunt.id)).value ?? const <HuntZone>[];
    final reports = ref.watch(huntReportsProvider(hunt.id));

    return AsyncValueView<HuntPermissions>(
      value: perms,
      onRetry: () => ref.invalidate(huntPermissionsProvider(hunt.id)),
      data: (p) {
        final openFollowUps = (reports.value ?? const <HuntReport>[]).where((r) => r.isOpenFollowUp).toList();
        return PageBody(
          children: [
            _HeaderCard(hunt: hunt, participantCount: participants.length, standCount: stands.length),
            const SizedBox(height: AppSpacing.sm),
            _MyParticipationCard(hunt: hunt, perms: p, stands: stands, zones: zones),
            if (p.canReport && hunt.status != HuntStatus.abgesagt) ...[
              const SizedBox(height: AppSpacing.sm),
              _QuickReports(huntId: hunt.id, stands: stands, myStandId: p.participation?.standId),
            ],
            if (openFollowUps.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.sm),
              _FollowUpBanner(reports: openFollowUps, stands: stands),
            ],
            _InfoSection(hunt: hunt),
            _ReportsSection(hunt: hunt, perms: p, reports: reports, stands: stands),
            _StandsSection(hunt: hunt, perms: p, stands: stands, zones: zones, participants: participants),
            _ParticipantsSection(hunt: hunt, perms: p, participants: participants, stands: stands, zones: zones),
            const SizedBox(height: AppSpacing.xl),
          ],
        );
      },
    );
  }
}

// -----------------------------------------------------------------------------
// Kopf
// -----------------------------------------------------------------------------
class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.hunt, required this.participantCount, required this.standCount});

  final Hunt hunt;
  final int participantCount;
  final int standCount;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final end = hunt.endsAt == null ? '' : ' – ${Formatters.time(hunt.endsAt!)} Uhr';
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(hunt.title, style: theme.textTheme.headlineSmall)),
              HuntStatusChip(hunt.status),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text('${Formatters.weekdayDate(hunt.startsAt)}, ${Formatters.time(hunt.startsAt)} Uhr$end'),
          Text(
            [
              if (hunt.revierName != null) 'Revier ${hunt.revierName}',
              if (hunt.groupName != null) hunt.groupName!,
              '$participantCount Teilnehmer',
              '$standCount Stände',
            ].join(' · '),
            style: muted,
          ),
        ],
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Eigene Teilnahme
// -----------------------------------------------------------------------------
class _MyParticipationCard extends ConsumerWidget {
  const _MyParticipationCard({required this.hunt, required this.perms, required this.stands, required this.zones});

  final Hunt hunt;
  final HuntPermissions perms;
  final List<HuntStand> stands;
  final List<HuntZone> zones;

  Future<void> _join(BuildContext context, WidgetRef ref) async {
    final role = await _pickRole(context, title: 'Wie bist du dabei?', roles: HuntRole.selfAssignable);
    if (role == null || !context.mounted) return;
    try {
      await ref.read(huntsRepositoryProvider).join(huntId: hunt.id, role: role);
      invalidateHunt(ref, hunt.id);
      if (context.mounted) showAppSnackBar(context, 'Du bist als ${role.label} eingetragen.');
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final me = perms.participation;

    if (me == null) {
      if (perms.canSelfJoin(hunt)) {
        return SectionCard(
          title: 'Bist du dabei?',
          icon: Icons.how_to_reg_outlined,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Trag dich als Schütze, Treiber, Hundeführer oder Helfer ein. Deinen Stand teilt dir die Jagdleitung zu.',
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(label: 'Ich bin dabei', icon: Icons.check, onPressed: () => _join(context, ref)),
            ],
          ),
        );
      }
      return SectionCard(
        title: 'Nicht eingetragen',
        icon: Icons.info_outline,
        child: Text(
          hunt.status.isOpen
              ? 'Die Jagdleitung trägt die Teilnehmer selbst ein.'
              : 'Diese Jagd ist ${hunt.status.label.toLowerCase()}.',
        ),
      );
    }

    final stand = stands.where((s) => s.id == me.standId).firstOrNull;
    final zone = zones.where((z) => z.id == me.zoneId).firstOrNull;
    return Card(
      color: theme.colorScheme.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(me.role.icon, color: theme.colorScheme.onPrimaryContainer),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: Text(
                    'Du bist dabei als ${me.role.label}',
                    style: theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.onPrimaryContainer),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            if (stand != null) ...[
              Text(
                'Dein Stand: ${stand.label}',
                style: theme.textTheme.headlineSmall?.copyWith(color: theme.colorScheme.onPrimaryContainer),
              ),
              if (stand.description.isNotEmpty)
                Text(stand.description, style: TextStyle(color: theme.colorScheme.onPrimaryContainer)),
              Text(
                stand.location.format(),
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onPrimaryContainer),
              ),
            ] else if (zone != null)
              Text(
                'Deine Zone: ${zone.name} (${zone.kind.label})',
                style: theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.onPrimaryContainer),
              )
            else
              Text(
                me.role == HuntRole.schuetze
                    ? 'Noch kein Stand zugeteilt. Die Jagdleitung teilt die Stände zu.'
                    : 'Noch keine Zuteilung.',
                style: TextStyle(color: theme.colorScheme.onPrimaryContainer),
              ),
            if (me.note.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.xs),
              Text('Notiz: ${me.note}', style: TextStyle(color: theme.colorScheme.onPrimaryContainer)),
            ],
          ],
        ),
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Schnellmeldungen
// -----------------------------------------------------------------------------
class _QuickReports extends StatelessWidget {
  const _QuickReports({required this.huntId, required this.stands, this.myStandId});

  final String huntId;
  final List<HuntStand> stands;
  final String? myStandId;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget button(HuntReportKind kind, Color bg, Color fg) => Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xxs),
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: bg,
            foregroundColor: fg,
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppSpacing.radiusSm)),
          ),
          onPressed: () => showReportSheet(context, huntId: huntId, kind: kind, stands: stands, myStandId: myStandId),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(kind.icon),
              const SizedBox(height: 2),
              FittedBox(child: Text(kind.label)),
            ],
          ),
        ),
      ),
    );
    return SectionCard(
      title: 'Melden',
      icon: Icons.campaign_outlined,
      child: Row(
        children: [
          button(HuntReportKind.erlegt, AppColors.success, Colors.white),
          button(HuntReportKind.angeschossen, AppColors.signalOrange, Colors.white),
          button(HuntReportKind.ueberschossen, scheme.surfaceContainerHighest, scheme.onSurface),
          button(HuntReportKind.anblick, scheme.secondaryContainer, scheme.onSecondaryContainer),
        ],
      ),
    );
  }
}

class _FollowUpBanner extends StatelessWidget {
  const _FollowUpBanner({required this.reports, required this.stands});

  final List<HuntReport> reports;
  final List<HuntStand> stands;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: AppColors.signalOrange.withValues(alpha: 0.15),
      child: ListTile(
        leading: const Icon(Icons.warning_amber_rounded, color: AppColors.signalOrange),
        title: Text(reports.length == 1 ? '1 offene Nachsuche' : '${reports.length} offene Nachsuchen'),
        subtitle: Text(
          reports.map((r) => _reportSummary(r, stands)).join('\n'),
          maxLines: 4,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Infos
// -----------------------------------------------------------------------------
class _InfoSection extends StatelessWidget {
  const _InfoSection({required this.hunt});

  final Hunt hunt;

  @override
  Widget build(BuildContext context) {
    final items = [
      (Icons.place_outlined, 'Treffpunkt', hunt.meetingPoint),
      (Icons.check_circle_outline, 'Freigabe', hunt.gameRelease),
      (Icons.health_and_safety_outlined, 'Sicherheit', hunt.safetyNotes),
      (Icons.emergency_outlined, 'Notfall', hunt.emergencyInfo),
      (Icons.notes, 'Weitere Infos', hunt.description),
    ].where((e) => e.$3.trim().isNotEmpty).toList();
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader('Wichtig für alle'),
        Card(
          child: Column(
            children: [
              for (final (i, e) in items.indexed) ...[
                if (i > 0) const Divider(),
                ListTile(leading: Icon(e.$1), title: Text(e.$2), subtitle: Text(e.$3)),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// Meldungen
// -----------------------------------------------------------------------------
String _reportSummary(HuntReport r, List<HuntStand> stands) {
  final stand = stands.where((s) => s.id == r.standId).firstOrNull;
  return [
    if (r.count > 1) '${r.count}×',
    r.species.isEmpty ? r.kind.label : '${r.species} ${r.kind.label.toLowerCase()}',
    if (stand != null) '· ${stand.label}',
    '· ${Formatters.time(r.occurredAt)}',
  ].join(' ');
}

class _ReportsSection extends ConsumerWidget {
  const _ReportsSection({required this.hunt, required this.perms, required this.reports, required this.stands});

  final Hunt hunt;
  final HuntPermissions perms;
  final AsyncValue<List<HuntReport>> reports;
  final List<HuntStand> stands;

  Future<void> _toggleResolved(BuildContext context, WidgetRef ref, HuntReport r) async {
    try {
      await ref.read(huntsRepositoryProvider).setReportResolved(reportId: r.id, resolved: !r.isResolved);
      invalidateHunt(ref, hunt.id);
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, HuntReport r) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Meldung löschen?',
      message: _reportSummary(r, stands),
      confirmLabel: 'Löschen',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(huntsRepositoryProvider).deleteReport(r.id);
      invalidateHunt(ref, hunt.id);
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = reports.value;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader('Meldungen${list == null ? '' : ' (${list.length})'}'),
        AsyncValueView<List<HuntReport>>(
          value: reports,
          onRetry: () => ref.invalidate(huntReportsProvider(hunt.id)),
          data: (list) => list.isEmpty
              ? const Card(
                  child: EmptyState(
                    icon: Icons.campaign_outlined,
                    title: 'Noch keine Meldungen',
                    message: 'Erlegt, angeschossen, überschossen oder Anblick – hier sehen alle sofort, was passiert.',
                  ),
                )
              : Card(
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: [
                      for (final (i, r) in list.indexed) ...[
                        if (i > 0) const Divider(),
                        ListTile(
                          leading: Icon(
                            r.kind.icon,
                            color: switch (r.kind) {
                              HuntReportKind.erlegt => AppColors.success,
                              HuntReportKind.angeschossen => AppColors.signalOrange,
                              _ => null,
                            },
                          ),
                          title: Text(_reportSummary(r, stands)),
                          subtitle: Text(
                            [
                              r.reporterName?.trim().isNotEmpty ?? false ? r.reporterName! : 'Unbekannt',
                              if (r.note.isNotEmpty) r.note,
                              if (r.kind == HuntReportKind.angeschossen)
                                r.isResolved ? 'Nachsuche erledigt' : 'Nachsuche offen',
                            ].join(' · '),
                          ),
                          trailing: perms.canEditReport(r)
                              ? PopupMenuButton<String>(
                                  tooltip: 'Meldung bearbeiten',
                                  onSelected: (v) =>
                                      v == 'resolve' ? _toggleResolved(context, ref, r) : _delete(context, ref, r),
                                  itemBuilder: (_) => [
                                    if (r.kind.needsFollowUp)
                                      PopupMenuItem(
                                        value: 'resolve',
                                        child: Text(r.isResolved ? 'Wieder öffnen' : 'Als erledigt markieren'),
                                      ),
                                    const PopupMenuItem(value: 'delete', child: Text('Löschen')),
                                  ],
                                )
                              : null,
                        ),
                      ],
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// Stände
// -----------------------------------------------------------------------------
class _StandsSection extends ConsumerWidget {
  const _StandsSection({
    required this.hunt,
    required this.perms,
    required this.stands,
    required this.zones,
    required this.participants,
  });

  final Hunt hunt;
  final HuntPermissions perms;
  final List<HuntStand> stands;
  final List<HuntZone> zones;
  final List<HuntParticipant> participants;

  Future<void> _delete(BuildContext context, WidgetRef ref, HuntStand s) async {
    final ok = await showConfirmDialog(
      context,
      title: '${s.label} löschen?',
      message: 'Zugeteilte Schützen verlieren diesen Stand.',
      confirmLabel: 'Löschen',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(huntsRepositoryProvider).deleteStand(s.id);
      invalidateHunt(ref, hunt.id);
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          'Stände (${stands.length})',
          trailing: perms.canManage
              ? TextButton.icon(
                  onPressed: () => context.push(Routes.standCreate(hunt.id)),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Stand'),
                )
              : null,
        ),
        if (stands.isEmpty)
          Card(
            child: EmptyState(
              icon: Icons.gps_fixed,
              title: 'Noch keine Stände',
              message: perms.canManage
                  ? 'Lege die Stände an und teile sie den Schützen zu.'
                  : 'Die Jagdleitung legt die Stände an.',
            ),
          )
        else
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (final (i, s) in stands.indexed) ...[
                  if (i > 0) const Divider(),
                  ListTile(
                    leading: CircleAvatar(child: Text('${i + 1}')),
                    title: Text(s.label),
                    subtitle: Text(
                      [
                        _assignedTo(s),
                        if (zones.where((z) => z.id == s.zoneId).firstOrNull case final z?) z.name,
                        if (s.description.isNotEmpty) s.description,
                      ].join(' · '),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: perms.canManage
                        ? PopupMenuButton<String>(
                            tooltip: 'Stand verwalten',
                            onSelected: (v) =>
                                v == 'edit' ? context.push(Routes.standEdit(hunt.id, s.id)) : _delete(context, ref, s),
                            itemBuilder: (_) => const [
                              PopupMenuItem(value: 'edit', child: Text('Bearbeiten')),
                              PopupMenuItem(value: 'delete', child: Text('Löschen')),
                            ],
                          )
                        : null,
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }

  String _assignedTo(HuntStand s) {
    final names = participants.where((p) => p.standId == s.id).map((p) => p.name).toList();
    return names.isEmpty ? 'frei' : names.join(', ');
  }
}

// -----------------------------------------------------------------------------
// Teilnehmer
// -----------------------------------------------------------------------------
enum _ParticipantAction { assignStand, assignZone, changeRole, remove }

class _ParticipantsSection extends ConsumerWidget {
  const _ParticipantsSection({
    required this.hunt,
    required this.perms,
    required this.participants,
    required this.stands,
    required this.zones,
  });

  final Hunt hunt;
  final HuntPermissions perms;
  final List<HuntParticipant> participants;
  final List<HuntStand> stands;
  final List<HuntZone> zones;

  List<HuntRole> get _assignableRoles {
    if (perms.canAppointLeader) return HuntRole.values;
    if (perms.canManage) return HuntRole.values.where((r) => r != HuntRole.jagdleiter).toList();
    return HuntRole.selfAssignable;
  }

  List<_ParticipantAction> _actionsFor(HuntParticipant p) {
    final isMe = p.userId == perms.userId;
    if (perms.canManage) {
      return [
        if (stands.isNotEmpty) _ParticipantAction.assignStand,
        if (zones.isNotEmpty) _ParticipantAction.assignZone,
        _ParticipantAction.changeRole,
        _ParticipantAction.remove,
      ];
    }
    if (isMe) return [_ParticipantAction.changeRole, _ParticipantAction.remove];
    return const [];
  }

  Future<void> _onAction(BuildContext context, WidgetRef ref, HuntParticipant p, _ParticipantAction a) async {
    final repo = ref.read(huntsRepositoryProvider);
    final isMe = p.userId == perms.userId;
    try {
      switch (a) {
        case _ParticipantAction.assignStand:
          final choice = await _pickOption<HuntStand>(
            context,
            title: 'Stand für ${p.name}',
            options: stands,
            label: (s) {
              final taken = participants.where((o) => o.standId == s.id && o.id != p.id).map((o) => o.name);
              return taken.isEmpty ? s.label : '${s.label} (${taken.join(', ')})';
            },
            selected: stands.where((s) => s.id == p.standId).firstOrNull,
          );
          if (choice == null) return;
          await repo.assign(participantId: p.id, standId: choice.value?.id, zoneId: p.zoneId);
        case _ParticipantAction.assignZone:
          final choice = await _pickOption<HuntZone>(
            context,
            title: 'Zone für ${p.name}',
            options: zones,
            label: (z) => '${z.name} (${z.kind.label})',
            selected: zones.where((z) => z.id == p.zoneId).firstOrNull,
          );
          if (choice == null) return;
          await repo.assign(participantId: p.id, standId: p.standId, zoneId: choice.value?.id);
        case _ParticipantAction.changeRole:
          final role = await _pickRole(context, title: 'Rolle von ${p.name}', roles: _assignableRoles);
          if (role == null) return;
          await repo.updateParticipant(participantId: p.id, role: role);
        case _ParticipantAction.remove:
          if (!context.mounted) return;
          final ok = await showConfirmDialog(
            context,
            title: isMe ? 'Austragen?' : '${p.name} austragen?',
            message: isMe
                ? 'Du bist danach nicht mehr für diese Jagd eingetragen. Ein Stand wird wieder frei.'
                : 'Die Person ist danach nicht mehr für diese Jagd eingetragen.',
            confirmLabel: 'Austragen',
            destructive: true,
          );
          if (!ok) return;
          await repo.removeParticipant(p.id);
      }
      invalidateHunt(ref, hunt.id);
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
    }
  }

  Future<void> _addMember(BuildContext context, WidgetRef ref) async {
    final List<GroupMember> members;
    try {
      members = await ref.read(groupMembersProvider(hunt.groupId).future);
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
      return;
    }
    final present = participants.map((p) => p.userId).toSet();
    final candidates = members.where((m) => !present.contains(m.userId)).toList();
    if (!context.mounted) return;
    if (candidates.isEmpty) {
      showAppSnackBar(context, 'Alle Mitglieder der Gruppe sind bereits eingetragen.');
      return;
    }
    final member = await _pickOption<GroupMember>(
      context,
      title: 'Mitglied eintragen',
      options: candidates,
      label: (m) => m.label,
      allowNone: false,
    );
    if (member?.value == null || !context.mounted) return;
    final role = await _pickRole(context, title: 'Rolle von ${member!.value!.label}', roles: _assignableRoles);
    if (role == null) return;
    try {
      await ref.read(huntsRepositoryProvider).addParticipant(huntId: hunt.id, userId: member.value!.userId, role: role);
      invalidateHunt(ref, hunt.id);
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          'Teilnehmer (${participants.length})',
          trailing: perms.canManage
              ? TextButton.icon(
                  onPressed: () => _addMember(context, ref),
                  icon: const Icon(Icons.person_add_alt, size: 18),
                  label: const Text('Eintragen'),
                )
              : null,
        ),
        if (participants.isEmpty)
          const Card(
            child: EmptyState(
              icon: Icons.groups_outlined,
              title: 'Noch niemand eingetragen',
              message: 'Gruppenmitglieder können sich selbst eintragen.',
            ),
          )
        else
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (final (i, p) in participants.indexed) ...[
                  if (i > 0) const Divider(),
                  ListTile(
                    leading: UserAvatar(name: p.name),
                    title: Text(p.userId == perms.userId ? '${p.name} (du)' : p.name),
                    subtitle: Text(
                      [
                        p.role.label,
                        if (stands.where((s) => s.id == p.standId).firstOrNull case final s?) s.label,
                        if (zones.where((z) => z.id == p.zoneId).firstOrNull case final z?) z.name,
                        if (p.note.isNotEmpty) p.note,
                      ].join(' · '),
                    ),
                    trailing: _actionsFor(p).isEmpty
                        ? Icon(p.role.icon)
                        : PopupMenuButton<_ParticipantAction>(
                            tooltip: 'Teilnahme verwalten',
                            icon: Icon(p.role.icon),
                            onSelected: (a) => _onAction(context, ref, p, a),
                            itemBuilder: (_) => [
                              for (final a in _actionsFor(p))
                                PopupMenuItem(
                                  value: a,
                                  child: Text(switch (a) {
                                    _ParticipantAction.assignStand => 'Stand zuteilen',
                                    _ParticipantAction.assignZone => 'Zone zuteilen',
                                    _ParticipantAction.changeRole => 'Rolle ändern',
                                    _ParticipantAction.remove => 'Austragen',
                                  }),
                                ),
                            ],
                          ),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// Auswahl-Dialoge
// -----------------------------------------------------------------------------
Future<HuntRole?> _pickRole(BuildContext context, {required String title, required List<HuntRole> roles}) =>
    showModalBottomSheet<HuntRole>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.xs),
              child: Text(title, style: Theme.of(context).textTheme.titleLarge),
            ),
            for (final r in roles)
              ListTile(leading: Icon(r.icon), title: Text(r.label), onTap: () => Navigator.of(context).pop(r)),
          ],
        ),
      ),
    );

/// Ergebnis einer Auswahl; `value == null` heißt „keine“ (Zuteilung entfernen).
class _Choice<T> {
  const _Choice(this.value);

  final T? value;
}

Future<_Choice<T>?> _pickOption<T>(
  BuildContext context, {
  required String title,
  required List<T> options,
  required String Function(T) label,
  T? selected,
  bool allowNone = true,
}) => showModalBottomSheet<_Choice<T>>(
  context: context,
  showDragHandle: true,
  isScrollControlled: true,
  builder: (context) => SafeArea(
    child: ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.7),
      child: ListView(
        shrinkWrap: true,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.xs),
            child: Text(title, style: Theme.of(context).textTheme.titleLarge),
          ),
          if (allowNone)
            ListTile(
              leading: const Icon(Icons.block),
              title: const Text('Keine Zuteilung'),
              onTap: () => Navigator.of(context).pop(_Choice<T>(null)),
            ),
          for (final o in options)
            ListTile(
              leading: Icon(o == selected ? Icons.radio_button_checked : Icons.radio_button_unchecked),
              title: Text(label(o)),
              onTap: () => Navigator.of(context).pop(_Choice<T>(o)),
            ),
        ],
      ),
    ),
  ),
);
