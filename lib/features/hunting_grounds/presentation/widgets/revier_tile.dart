import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/routes.dart';
import '../../domain/revier.dart';

/// Listeneintrag eines Reviers.
class RevierTile extends StatelessWidget {
  const RevierTile({super.key, required this.revier, this.showGroup = true});

  final Revier revier;
  final bool showGroup;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final subtitle = [
      if (showGroup && revier.groupName != null) revier.groupName!,
      if (revier.description.isNotEmpty) revier.description,
    ].join(' · ');
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: scheme.secondaryContainer,
        foregroundColor: scheme.onSecondaryContainer,
        child: const Icon(Icons.terrain_outlined),
      ),
      title: Text(revier.name),
      subtitle: subtitle.isEmpty ? null : Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => context.push(Routes.revier(revier.groupId, revier.id)),
    );
  }
}
