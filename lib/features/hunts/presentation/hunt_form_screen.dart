import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/routes.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/validators.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../core/widgets/dialogs.dart';
import '../../../core/widgets/layout.dart';
import '../../../core/widgets/state_views.dart';
import '../../groups/domain/hunting_group.dart';
import '../../groups/presentation/groups_providers.dart';
import '../../hunting_grounds/domain/revier.dart';
import '../../hunting_grounds/presentation/reviere_providers.dart';
import '../domain/hunt.dart';
import '../domain/hunt_enums.dart';
import '../domain/hunt_permissions.dart';
import 'hunts_providers.dart';

/// Jagd anlegen (in einer Gruppe) oder bearbeiten.
class HuntFormScreen extends ConsumerWidget {
  const HuntFormScreen({super.key, required String this.groupId}) : huntId = null;

  const HuntFormScreen.edit({super.key, required String this.huntId}) : groupId = null;

  final String? groupId;
  final String? huntId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isEdit = huntId != null;
    return Scaffold(
      appBar: AppBar(title: Text(isEdit ? 'Jagd bearbeiten' : 'Jagd anlegen')),
      body: isEdit ? _EditLoader(huntId: huntId!) : _CreateLoader(groupId: groupId!),
    );
  }
}

class _CreateLoader extends ConsumerWidget {
  const _CreateLoader({required this.groupId});

  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<MyGroup>(
      value: ref.watch(myGroupProvider(groupId)),
      onRetry: () => ref.invalidate(myGroupProvider(groupId)),
      data: (g) {
        if (!g.permissions.canCreateRevier) {
          return const EmptyState(
            icon: Icons.lock_outline,
            title: 'Keine Berechtigung',
            message: 'Jagden legen Owner und Admins der Gruppe an.',
          );
        }
        return _HuntForm(groupId: g.group.id, groupName: g.group.name);
      },
    );
  }
}

class _EditLoader extends ConsumerWidget {
  const _EditLoader({required this.huntId});

  final String huntId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<Hunt>(
      value: ref.watch(huntProvider(huntId)),
      onRetry: () => ref.invalidate(huntProvider(huntId)),
      data: (hunt) => AsyncValueView<HuntPermissions>(
        value: ref.watch(huntPermissionsProvider(huntId)),
        onRetry: () => ref.invalidate(huntPermissionsProvider(huntId)),
        data: (perms) => perms.canManage
            ? _HuntForm(groupId: hunt.groupId, groupName: hunt.groupName ?? '', existing: hunt)
            : const EmptyState(
                icon: Icons.lock_outline,
                title: 'Keine Berechtigung',
                message: 'Nur die Jagdleitung kann die Jagd bearbeiten.',
              ),
      ),
    );
  }
}

class _HuntForm extends ConsumerStatefulWidget {
  const _HuntForm({required this.groupId, required this.groupName, this.existing});

  final String groupId;
  final String groupName;
  final Hunt? existing;

  @override
  ConsumerState<_HuntForm> createState() => _HuntFormState();
}

class _HuntFormState extends ConsumerState<_HuntForm> {
  final _formKey = GlobalKey<FormState>();
  late final Hunt? _e = widget.existing;
  late final _title = TextEditingController(text: _e?.title ?? '');
  late final _description = TextEditingController(text: _e?.description ?? '');
  late final _meetingPoint = TextEditingController(text: _e?.meetingPoint ?? '');
  late final _gameRelease = TextEditingController(text: _e?.gameRelease ?? '');
  late final _safety = TextEditingController(text: _e?.safetyNotes ?? '');
  late final _emergency = TextEditingController(text: _e?.emergencyInfo ?? '');
  late DateTime _startsAt = _e?.startsAt.toLocal() ?? _defaultStart();
  late DateTime? _endsAt = _e?.endsAt?.toLocal();
  late String? _revierId = _e?.revierId;
  late HuntStatus _status = _e?.status ?? HuntStatus.geplant;
  late bool _selfJoin = _e?.selfJoin ?? true;
  bool _saving = false;

  /// Nächster Samstag, 8:00 Uhr – typischer Beginn einer Drückjagd.
  static DateTime _defaultStart() {
    final now = DateTime.now();
    final days = (DateTime.saturday - now.weekday) % 7;
    final d = now.add(Duration(days: days == 0 ? 7 : days));
    return DateTime(d.year, d.month, d.day, 8);
  }

  @override
  void dispose() {
    for (final c in [_title, _description, _meetingPoint, _gameRelease, _safety, _emergency]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<DateTime?> _pick(DateTime initial) async {
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (date == null || !mounted) return null;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(initial));
    if (time == null) return null;
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_endsAt != null && !_endsAt!.isAfter(_startsAt)) {
      showAppSnackBar(context, 'Das Ende muss nach dem Beginn liegen.', isError: true);
      return;
    }
    setState(() => _saving = true);
    final draft = HuntDraft(
      title: _title.text,
      startsAt: _startsAt,
      endsAt: _endsAt,
      revierId: _revierId,
      status: _status,
      description: _description.text,
      meetingPoint: _meetingPoint.text,
      meetingLocation: _e?.meetingLocation,
      gameRelease: _gameRelease.text,
      safetyNotes: _safety.text,
      emergencyInfo: _emergency.text,
      selfJoin: _selfJoin,
    );
    final repo = ref.read(huntsRepositoryProvider);
    try {
      final saved = _e == null
          ? await repo.create(groupId: widget.groupId, draft: draft)
          : await repo.update(huntId: _e.id, draft: draft);
      invalidateHunt(ref, saved.id, groupId: widget.groupId);
      if (!mounted) return;
      showAppSnackBar(context, _e == null ? 'Jagd wurde angelegt. Du bist Jagdleiter.' : 'Jagd gespeichert.');
      if (_e == null) {
        context.pushReplacement(Routes.hunt(saved.id));
      } else {
        context.pop();
      }
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final reviere = ref.watch(groupReviereProvider(widget.groupId));
    return Form(
      key: _formKey,
      child: PageBody(
        children: [
          if (widget.groupName.isNotEmpty)
            Card(
              child: ListTile(
                leading: const Icon(Icons.groups_outlined),
                title: Text(widget.groupName),
                subtitle: const Text('Gruppe'),
              ),
            ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            label: 'Titel',
            controller: _title,
            prefixIcon: Icons.flag_outlined,
            hint: 'z. B. Drückjagd Eichenhain',
            textCapitalization: TextCapitalization.sentences,
            maxLength: 120,
            validator: Validators.huntTitle,
          ),
          const SizedBox(height: AppSpacing.xs),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.event_outlined),
                  title: const Text('Beginn'),
                  subtitle: Text('${Formatters.weekdayDate(_startsAt)}, ${Formatters.time(_startsAt)} Uhr'),
                  trailing: const Icon(Icons.edit_outlined),
                  onTap: () async {
                    final v = await _pick(_startsAt);
                    if (v != null) setState(() => _startsAt = v);
                  },
                ),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.event_available_outlined),
                  title: const Text('Ende (optional)'),
                  subtitle: Text(
                    _endsAt == null
                        ? 'nicht festgelegt'
                        : '${Formatters.weekdayDate(_endsAt!)}, ${Formatters.time(_endsAt!)} Uhr',
                  ),
                  trailing: _endsAt == null
                      ? const Icon(Icons.add)
                      : IconButton(
                          tooltip: 'Ende entfernen',
                          icon: const Icon(Icons.clear),
                          onPressed: () => setState(() => _endsAt = null),
                        ),
                  onTap: () async {
                    final v = await _pick(_endsAt ?? _startsAt.add(const Duration(hours: 6)));
                    if (v != null) setState(() => _endsAt = v);
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          AsyncValueView<List<Revier>>(
            value: reviere,
            onRetry: () => ref.invalidate(groupReviereProvider(widget.groupId)),
            data: (list) => DropdownButtonFormField<String?>(
              isExpanded: true,
              initialValue: list.any((r) => r.id == _revierId) ? _revierId : null,
              decoration: const InputDecoration(labelText: 'Revier', prefixIcon: Icon(Icons.terrain_outlined)),
              items: [
                const DropdownMenuItem(value: null, child: Text('Kein bestimmtes Revier')),
                for (final r in list) DropdownMenuItem(value: r.id, child: Text(r.name)),
              ],
              onChanged: (v) => setState(() => _revierId = v),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            label: 'Treffpunkt',
            controller: _meetingPoint,
            prefixIcon: Icons.place_outlined,
            hint: 'z. B. Parkplatz am Forsthaus, 7:30 Uhr',
            textCapitalization: TextCapitalization.sentences,
            maxLength: 500,
            validator: Validators.maxLength(500),
          ),
          const SizedBox(height: AppSpacing.xs),
          AppTextField(
            label: 'Freigabe',
            controller: _gameRelease,
            prefixIcon: Icons.check_circle_outline,
            hint: 'z. B. Schwarzwild (keine führenden Bachen), Rehwild weiblich und Kitze',
            maxLines: 3,
            maxLength: 2000,
            textCapitalization: TextCapitalization.sentences,
            validator: Validators.maxLength(2000),
          ),
          const SizedBox(height: AppSpacing.xs),
          AppTextField(
            label: 'Sicherheitshinweise',
            controller: _safety,
            prefixIcon: Icons.health_and_safety_outlined,
            hint: 'Signalkleidung, Schussfeld, Hahn-in-Ruh-Signal …',
            maxLines: 4,
            maxLength: 4000,
            textCapitalization: TextCapitalization.sentences,
            validator: Validators.maxLength(4000),
          ),
          const SizedBox(height: AppSpacing.xs),
          AppTextField(
            label: 'Notfall',
            controller: _emergency,
            prefixIcon: Icons.emergency_outlined,
            hint: 'Rettungspunkt, nächstes Krankenhaus, Telefon Jagdleiter',
            maxLines: 3,
            maxLength: 2000,
            textCapitalization: TextCapitalization.sentences,
            validator: Validators.maxLength(2000),
          ),
          const SizedBox(height: AppSpacing.xs),
          AppTextField(
            label: 'Weitere Infos (optional)',
            controller: _description,
            hint: 'Ablauf, Treiben, Strecke legen, Schüsseltreiben …',
            maxLines: 4,
            maxLength: 4000,
            textCapitalization: TextCapitalization.sentences,
            validator: Validators.maxLength(4000),
          ),
          if (_e != null) ...[
            const SizedBox(height: AppSpacing.xs),
            DropdownButtonFormField<HuntStatus>(
              isExpanded: true,
              initialValue: _status,
              decoration: const InputDecoration(labelText: 'Status', prefixIcon: Icon(Icons.timelapse)),
              items: [for (final s in HuntStatus.values) DropdownMenuItem(value: s, child: Text(s.label))],
              onChanged: (v) => setState(() => _status = v ?? _status),
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          Card(
            child: SwitchListTile(
              value: _selfJoin,
              onChanged: (v) => setState(() => _selfJoin = v),
              title: const Text('Selbst eintragen erlaubt'),
              subtitle: const Text('Gruppenmitglieder können sich selbst als Schütze, Treiber usw. anmelden.'),
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Zonen und Stände legst du nach dem Speichern in der Jagd an.',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: _e == null ? 'Jagd anlegen' : 'Speichern',
            icon: Icons.check,
            isLoading: _saving,
            onPressed: _save,
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
      ),
    );
  }
}
