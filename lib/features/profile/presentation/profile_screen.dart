import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/routes.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/dialogs.dart';
import '../../../core/widgets/layout.dart';
import '../../../core/widgets/state_views.dart';
import '../../../core/widgets/user_avatar.dart';
import '../../authentication/presentation/auth_providers.dart';
import '../domain/profile.dart';
import 'profile_providers.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Abmelden?',
      message: 'Du kannst dich jederzeit wieder mit deiner E-Mail-Adresse anmelden.',
      confirmLabel: 'Abmelden',
    );
    if (!confirmed) return;
    await ref.read(authControllerProvider.notifier).signOut();
    final state = ref.read(authControllerProvider);
    if (state.hasError && context.mounted) showErrorSnackBar(context, state.error!);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(currentProfileProvider);
    final email = ref.watch(authRepositoryProvider).currentUser?.email;
    final signingOut = ref.watch(authControllerProvider).isLoading;

    return Scaffold(
      appBar: AppBar(title: const Text('Profil')),
      body: AsyncValueView<Profile>(
        value: profile,
        onRetry: () => ref.invalidate(currentProfileProvider),
        data: (p) => RefreshIndicator(
          onRefresh: () => ref.refresh(currentProfileProvider.future),
          child: PageBody(
            children: [
              const SizedBox(height: AppSpacing.md),
              Center(child: UserAvatar(name: p.label, radius: 44)),
              const SizedBox(height: AppSpacing.md),
              Text(p.label, style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
              if (p.username != null)
                Text(
                  '@${p.username}',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
              const SizedBox(height: AppSpacing.lg),
              if (!p.isComplete) ...[
                _CompleteProfileHint(onTap: () => context.push(Routes.profileEdit)),
                const SizedBox(height: AppSpacing.md),
              ],
              SectionCard(
                title: 'Konto',
                icon: Icons.person_outline,
                child: Column(
                  children: [
                    _InfoRow(label: 'Anzeigename', value: p.displayName.isEmpty ? '–' : p.displayName),
                    _InfoRow(label: 'Benutzername', value: p.username == null ? '–' : '@${p.username}'),
                    _InfoRow(label: 'E-Mail', value: email ?? '–'),
                    const _InfoRow(label: 'Profilbild', value: 'Upload folgt in Phase 2'),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: 'Profil bearbeiten',
                icon: Icons.edit_outlined,
                onPressed: () => context.push(Routes.profileEdit),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton.secondary(
                label: 'Abmelden',
                icon: Icons.logout,
                isLoading: signingOut,
                onPressed: () => _signOut(context, ref),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CompleteProfileHint extends StatelessWidget {
  const _CompleteProfileHint({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: scheme.tertiaryContainer,
      child: ListTile(
        leading: Icon(Icons.info_outline, color: scheme.onTertiaryContainer),
        title: Text('Profil vervollständigen', style: TextStyle(color: scheme.onTertiaryContainer)),
        subtitle: Text(
          'Lege Anzeige- und Benutzernamen fest, damit deine Gruppe dich erkennt.',
          style: TextStyle(color: scheme.onTertiaryContainer),
        ),
        trailing: Icon(Icons.chevron_right, color: scheme.onTertiaryContainer),
        onTap: onTap,
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ),
          Expanded(child: Text(value, style: theme.textTheme.bodyMedium)),
        ],
      ),
    );
  }
}
