import 'package:flutter/material.dart';

import '../../../../app/theme/app_spacing.dart';
import '../../domain/group_role.dart';

/// Kleines Etikett für die Rolle eines Mitglieds.
class RoleBadge extends StatelessWidget {
  const RoleBadge(this.role, {super.key});

  final GroupRole role;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (bg, fg, icon) = switch (role) {
      GroupRole.owner => (scheme.primary, scheme.onPrimary, Icons.shield),
      GroupRole.admin => (scheme.secondaryContainer, scheme.onSecondaryContainer, Icons.shield_outlined),
      GroupRole.member => (scheme.surfaceContainerHigh, scheme.onSurfaceVariant, Icons.person_outline),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppSpacing.radiusSm)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          const SizedBox(width: 4),
          Text(role.label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
