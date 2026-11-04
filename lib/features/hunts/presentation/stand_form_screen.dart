import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/app_spacing.dart';
import '../../../core/geo/geo_point.dart';
import '../../../core/utils/validators.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../core/widgets/dialogs.dart';
import '../../../core/widgets/layout.dart';
import '../../../core/widgets/state_views.dart';
import '../domain/hunt_permissions.dart';
import '../domain/hunt_stand.dart';
import '../domain/hunt_zone.dart';
import 'hunts_providers.dart';

/// Stand anlegen ([standId] == null) oder bearbeiten. Nur für die Jagdleitung.
class StandFormScreen extends ConsumerWidget {
  const StandFormScreen({super.key, required this.huntId, this.standId});

  final String huntId;
  final String? standId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final perms = ref.watch(huntPermissionsProvider(huntId));
    final stands = ref.watch(huntStandsProvider(huntId));
    return Scaffold(
      appBar: AppBar(title: Text(standId == null ? 'Stand anlegen' : 'Stand bearbeiten')),
      body: AsyncValueView<HuntPermissions>(
        value: perms,
        onRetry: () => ref.invalidate(huntPermissionsProvider(huntId)),
        data: (p) {
          if (!p.canManage) {
            return const EmptyState(
              icon: Icons.lock_outline,
              title: 'Keine Berechtigung',
              message: 'Stände legt die Jagdleitung an.',
            );
          }
          return AsyncValueView<List<HuntStand>>(
            value: stands,
            onRetry: () => ref.invalidate(huntStandsProvider(huntId)),
            data: (list) => _StandForm(
              huntId: huntId,
              existing: standId == null ? null : list.where((s) => s.id == standId).firstOrNull,
              nextNumber: list.length + 1,
            ),
          );
        },
      ),
    );
  }
}

class _StandForm extends ConsumerStatefulWidget {
  const _StandForm({required this.huntId, required this.nextNumber, this.existing});

  final String huntId;
  final int nextNumber;
  final HuntStand? existing;

  @override
  ConsumerState<_StandForm> createState() => _StandFormState();
}

class _StandFormState extends ConsumerState<_StandForm> {
  final _formKey = GlobalKey<FormState>();
  late final HuntStand? _e = widget.existing;
  late final _label = TextEditingController(text: _e?.label ?? 'Stand ${widget.nextNumber}');
  late final _coordinates = TextEditingController(text: _e?.location.format() ?? '');
  late final _description = TextEditingController(text: _e?.description ?? '');
  late String? _zoneId = _e?.zoneId;
  bool _saving = false;

  @override
  void dispose() {
    _label.dispose();
    _coordinates.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final point = GeoPoint.tryParse(_coordinates.text)!;
    setState(() => _saving = true);
    final repo = ref.read(huntsRepositoryProvider);
    try {
      if (_e == null) {
        await repo.createStand(
          huntId: widget.huntId,
          label: _label.text,
          latitude: point.latitude,
          longitude: point.longitude,
          zoneId: _zoneId,
          description: _description.text,
          sortOrder: widget.nextNumber,
        );
      } else {
        await repo.updateStand(
          standId: _e.id,
          label: _label.text,
          latitude: point.latitude,
          longitude: point.longitude,
          waypointId: _e.waypointId,
          zoneId: _zoneId,
          description: _description.text,
          sortOrder: _e.sortOrder,
        );
      }
      invalidateHunt(ref, widget.huntId);
      if (!mounted) return;
      showAppSnackBar(context, _e == null ? 'Stand wurde angelegt.' : 'Stand gespeichert.');
      context.pop();
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final zones = ref.watch(huntZonesProvider(widget.huntId)).value ?? const <HuntZone>[];
    return Form(
      key: _formKey,
      child: PageBody(
        children: [
          AppTextField(
            label: 'Bezeichnung',
            controller: _label,
            prefixIcon: Icons.gps_fixed,
            hint: 'z. B. Stand 12 oder Bock am Bach',
            maxLength: 60,
            textCapitalization: TextCapitalization.sentences,
            validator: Validators.standLabel,
          ),
          const SizedBox(height: AppSpacing.xs),
          AppTextField(
            label: 'Koordinaten',
            controller: _coordinates,
            prefixIcon: Icons.my_location,
            hint: '51.16868, 7.24749',
            helper:
                'Breite, Länge – z. B. in Google Maps lange auf den Punkt drücken und kopieren. '
                'Mit dem Karten-Update setzt du Stände direkt auf der Karte.',
            keyboardType: TextInputType.text,
            validator: Validators.coordinates,
          ),
          if (zones.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            DropdownButtonFormField<String?>(
              isExpanded: true,
              initialValue: zones.any((z) => z.id == _zoneId) ? _zoneId : null,
              decoration: const InputDecoration(labelText: 'Zone / Treiben', prefixIcon: Icon(Icons.layers_outlined)),
              items: [
                const DropdownMenuItem(value: null, child: Text('Keine Zone')),
                for (final z in zones) DropdownMenuItem(value: z.id, child: Text('${z.name} (${z.kind.label})')),
              ],
              onChanged: (v) => setState(() => _zoneId = v),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            label: 'Hinweise (optional)',
            controller: _description,
            hint: 'Schussrichtung, Zustieg, Nachbarstände, Gefahren …',
            maxLines: 4,
            maxLength: 2000,
            textCapitalization: TextCapitalization.sentences,
            validator: Validators.maxLength(2000),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: _e == null ? 'Stand anlegen' : 'Speichern',
            icon: Icons.check,
            isLoading: _saving,
            onPressed: _save,
          ),
        ],
      ),
    );
  }
}
