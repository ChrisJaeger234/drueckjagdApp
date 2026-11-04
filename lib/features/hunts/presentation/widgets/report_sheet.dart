import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/dialogs.dart';
import '../../domain/hunt_enums.dart';
import '../../domain/hunt_report.dart';
import '../../domain/hunt_stand.dart';
import '../hunts_providers.dart';

/// Häufige Wildarten bei Drückjagden (frei ergänzbar).
const commonSpecies = ['Schwarzwild', 'Rehwild', 'Rotwild', 'Damwild', 'Fuchs', 'Waschbär'];

/// Meldung erfassen: Art ist vorausgewählt, Wildart per Tipp.
Future<void> showReportSheet(
  BuildContext context, {
  required String huntId,
  required HuntReportKind kind,
  required List<HuntStand> stands,
  String? myStandId,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => _ReportSheet(huntId: huntId, kind: kind, stands: stands, standId: myStandId),
);

class _ReportSheet extends ConsumerStatefulWidget {
  const _ReportSheet({required this.huntId, required this.kind, required this.stands, this.standId});

  final String huntId;
  final HuntReportKind kind;
  final List<HuntStand> stands;
  final String? standId;

  @override
  ConsumerState<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends ConsumerState<_ReportSheet> {
  late HuntReportKind _kind = widget.kind;
  late String? _standId = widget.standId;
  final _species = TextEditingController();
  final _note = TextEditingController();
  int _count = 1;
  bool _saving = false;

  @override
  void dispose() {
    _species.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _saving = true);
    try {
      await ref
          .read(huntsRepositoryProvider)
          .createReport(
            HuntReportDraft(
              huntId: widget.huntId,
              kind: _kind,
              species: _species.text,
              count: _count,
              standId: _standId,
              note: _note.text,
            ),
          );
      invalidateHunt(ref, widget.huntId);
      if (!mounted) return;
      Navigator.of(context).pop();
      showAppSnackBar(context, 'Meldung „${_kind.label}“ gesendet.');
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
      padding: EdgeInsets.fromLTRB(
        AppSpacing.md,
        0,
        AppSpacing.md,
        AppSpacing.md + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Meldung', style: theme.textTheme.titleLarge),
            const SizedBox(height: AppSpacing.sm),
            SegmentedButton<HuntReportKind>(
              showSelectedIcon: false,
              segments: [
                for (final k in HuntReportKind.values.where((k) => k != HuntReportKind.sonstiges))
                  ButtonSegment(
                    value: k,
                    label: Text(k.label, style: const TextStyle(fontSize: 12)),
                  ),
              ],
              selected: {_kind},
              onSelectionChanged: (s) => setState(() => _kind = s.first),
            ),
            const SizedBox(height: AppSpacing.md),
            Text('Wildart', style: theme.textTheme.labelLarge),
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                for (final s in commonSpecies)
                  ChoiceChip(
                    label: Text(s),
                    selected: _species.text == s,
                    onSelected: (v) => setState(() => _species.text = v ? s : ''),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            TextField(
              controller: _species,
              maxLength: 60,
              decoration: const InputDecoration(labelText: 'Wildart (frei)', hintText: 'z. B. Überläufer, Schmalreh'),
              onChanged: (_) => setState(() {}),
            ),
            Row(
              children: [
                Text('Anzahl', style: theme.textTheme.labelLarge),
                const Spacer(),
                IconButton(
                  tooltip: 'Weniger',
                  onPressed: _count > 1 ? () => setState(() => _count--) : null,
                  icon: const Icon(Icons.remove_circle_outline),
                ),
                Text('$_count', style: theme.textTheme.titleMedium),
                IconButton(
                  tooltip: 'Mehr',
                  onPressed: _count < 100 ? () => setState(() => _count++) : null,
                  icon: const Icon(Icons.add_circle_outline),
                ),
              ],
            ),
            if (widget.stands.isNotEmpty)
              DropdownButtonFormField<String?>(
                isExpanded: true,
                initialValue: widget.stands.any((s) => s.id == _standId) ? _standId : null,
                decoration: const InputDecoration(labelText: 'Stand', prefixIcon: Icon(Icons.gps_fixed)),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Ohne Stand')),
                  for (final s in widget.stands) DropdownMenuItem(value: s.id, child: Text(s.label)),
                ],
                onChanged: (v) => setState(() => _standId = v),
              ),
            const SizedBox(height: AppSpacing.xs),
            TextField(
              controller: _note,
              maxLength: 1000,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Notiz (optional)',
                hintText: 'z. B. flüchtig Richtung Bach, Schweiß am Anschuss',
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(label: 'Melden', icon: Icons.send, isLoading: _saving, onPressed: _send),
          ],
        ),
      ),
    );
  }
}
