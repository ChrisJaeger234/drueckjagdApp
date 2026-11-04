import 'package:flutter/material.dart';

/// Avatar mit Initialen. Profilbilder (Storage-Bucket „avatars“) folgen in
/// Phase 2; bis dahin werden immer Initialen angezeigt.
class UserAvatar extends StatelessWidget {
  const UserAvatar({super.key, required this.name, this.radius = 22});

  final String name;
  final double radius;

  static String initialsOf(String name) {
    final parts = name.trim().split(RegExp(r'[\s_.-]+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return CircleAvatar(
      radius: radius,
      backgroundColor: scheme.primaryContainer,
      foregroundColor: scheme.onPrimaryContainer,
      child: Text(
        initialsOf(name),
        style: TextStyle(fontWeight: FontWeight.w700, fontSize: radius * 0.75),
      ),
    );
  }
}
