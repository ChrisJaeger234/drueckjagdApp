import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_spacing.dart';
import '../../../../core/geo/geo_point.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_text_field.dart';
import '../../../../core/widgets/dialogs.dart';
import '../../domain/waypoint.dart';
import '../../domain/waypoint_category.dart';
import '../map_providers.dart';

/// Einrichtung anlegen ([existing] == null) oder bearbeiten.
/// Liefert die gespeicherte Einrichtung oder `null` bei Abbruch.
Future<Waypoint?> showWaypointForm(
  BuildContext context, {
  required String revierId,
  GeoPoint? point,
  Waypoint? existing,
}) => showModalBottomSheet<Waypoint>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => _WaypointForm(revierId: revierId, point: point ?? existing!.location, existing: existing),
);

class _WaypointForm extends ConsumerStatefulWidget {
  const _WaypointForm({required this.revierId, required this.point, this.existing});

  final String revierId;
  final GeoPoint point;
  final Waypoint? existing;

  @override
  ConsumerState<_WaypointForm> createState() => _WaypointFormState();
}

class _WaypointFormState extends ConsumerState<_WaypointForm> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.existing?.name ?? '');
  late final _coordinates = TextEditingController(text: widget.point.format());
  late final _description = TextEditingController(text: widget.existing?.description ?? '');
  late WaypointCategory _category = widget.existing?.category ?? WaypointCategory.hochsitz;
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _coordinates.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    final draft = WaypointDraft(
      name: _name.text,
      category: _category,
      location: GeoPoint.tryParse(_coordinates.text)!,
      description: _description.text,
    );
    final repo = ref.read(revierMapRepositoryProvider);
    try {
      final saved = widget.existing == null
          ? await repo.createWaypoint(revierId: widget.revierId, draft: draft)
          : await repo.updateWaypoint(waypointId: widget.existing!.id, draft: draft);
      ref.invalidate(revierWaypointsProvider(widget.revierId));
      if (!mounted) return;
      Navigator.of(context).pop(saved);
      showAppSnackBar(context, widget.existing == null ? '„${saved.name}“ angelegt.' : 'Gespeichert.');
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.lg),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.existing == null ? 'Einrichtung anlegen' : 'Einrichtung bearbeiten',
                style: theme.textTheme.titleLarge,
              ),
              const SizedBox(height: AppSpacing.sm),
              Wrap(
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                children: [
                  for (final c in WaypointCategory.values)
                    ChoiceChip(
                      avatar: Icon(c.icon, size: 18),
                      label: Text(c.label),
                      selected: c == _category,
                      onSelected: (_) => setState(() => _category = c),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                label: 'Name',
                controller: _name,
                prefixIcon: _category.icon,
                hint: 'z. B. Bock am Bach, Kanzel 3',
                maxLength: 120,
                textCapitalization: TextCapitalization.sentences,
                validator: Validators.waypointName,
              ),
              const SizedBox(height: AppSpacing.xs),
              AppTextField(
                label: 'Koordinaten',
                controller: _coordinates,
                prefixIcon: Icons.my_location,
                validator: Validators.coordinates,
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                label: 'Notiz (optional)',
                controller: _description,
                hint: 'Zustand, Zugang, Schussrichtung …',
                maxLines: 3,
                maxLength: 2000,
                textCapitalization: TextCapitalization.sentences,
                validator: Validators.maxLength(2000),
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(label: 'Speichern', icon: Icons.check, isLoading: _saving, onPressed: _save),
            ],
          ),
        ),
      ),
    );
  }
}

/// Details einer Einrichtung mit Bearbeiten/Löschen, sofern erlaubt.
Future<void> showWaypointDetails(
  BuildContext context, {
  required Waypoint waypoint,
  required bool canEdit,
  List<Widget> extraActions = const [],
}) => showModalBottomSheet<void>(
  context: context,
  showDragHandle: true,
  isScrollControlled: true,
  builder: (_) => _WaypointDetails(waypoint: waypoint, canEdit: canEdit, extraActions: extraActions),
);

class _WaypointDetails extends ConsumerWidget {
  const _WaypointDetails({required this.waypoint, required this.canEdit, required this.extraActions});

  final Waypoint waypoint;
  final bool canEdit;
  final List<Widget> extraActions;

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Einrichtung löschen?',
      message: '„${waypoint.name}“ wird für alle Mitglieder entfernt.',
      confirmLabel: 'Löschen',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(revierMapRepositoryProvider).deleteWaypoint(waypoint.id);
      ref.invalidate(revierWaypointsProvider(waypoint.revierId));
      if (!context.mounted) return;
      Navigator.of(context).pop();
      showAppSnackBar(context, '„${waypoint.name}“ gelöscht.');
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: CircleAvatar(child: Icon(waypoint.category.icon)),
              title: Text(waypoint.name, style: theme.textTheme.titleLarge),
              subtitle: Text(waypoint.category.label),
            ),
            if (waypoint.description.isNotEmpty) ...[
              Text(waypoint.description, style: theme.textTheme.bodyMedium),
              const SizedBox(height: AppSpacing.sm),
            ],
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.my_location),
              title: Text(waypoint.location.format()),
              trailing: IconButton(
                tooltip: 'Koordinaten kopieren',
                icon: const Icon(Icons.copy),
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: waypoint.location.format()));
                  if (context.mounted) showAppSnackBar(context, 'Koordinaten kopiert.');
                },
              ),
            ),
            ...extraActions,
            if (canEdit)
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        final nav = Navigator.of(context);
                        nav.pop();
                        await showWaypointForm(nav.context, revierId: waypoint.revierId, existing: waypoint);
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
