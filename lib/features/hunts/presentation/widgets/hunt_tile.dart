import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/routes.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_spacing.dart';
import '../../../../core/utils/formatters.dart';
import '../../domain/hunt.dart';
import '../../domain/hunt_enums.dart';

/// Farbiges Etikett für den Status einer Jagd.
class HuntStatusChip extends StatelessWidget {
  const HuntStatusChip(this.status, {super.key});

  final HuntStatus status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (bg, fg) = switch (status) {
      HuntStatus.geplant => (scheme.secondaryContainer, scheme.onSecondaryContainer),
      HuntStatus.laufend => (AppColors.signalOrange, Colors.white),
      HuntStatus.beendet => (scheme.surfaceContainerHigh, scheme.onSurfaceVariant),
      HuntStatus.abgesagt => (scheme.errorContainer, scheme.onErrorContainer),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppSpacing.radiusSm)),
      child: Text(
        status.label,
        style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w700),
      ),
    );
  }
}

/// Listeneintrag einer Jagd.
class HuntTile extends StatelessWidget {
  const HuntTile({super.key, required this.hunt, this.showGroup = true});

  final Hunt hunt;
  final bool showGroup;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final subtitle = [
      '${Formatters.weekdayDate(hunt.startsAt)}, ${Formatters.time(hunt.startsAt)} Uhr',
      if (hunt.revierName != null) hunt.revierName!,
      if (showGroup && hunt.groupName != null) hunt.groupName!,
    ].join(' · ');
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: hunt.status == HuntStatus.laufend ? AppColors.signalOrange : scheme.primaryContainer,
        foregroundColor: hunt.status == HuntStatus.laufend ? Colors.white : scheme.onPrimaryContainer,
        child: const Icon(Icons.flag_outlined),
      ),
      title: Text(hunt.title),
      subtitle: Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis),
      trailing: HuntStatusChip(hunt.status),
      onTap: () => context.push(Routes.hunt(hunt.id)),
    );
  }
}

/// Jagden, die noch anstehen oder laufen, zuerst; danach die vergangenen.
List<Hunt> sortHuntsForDisplay(List<Hunt> hunts) {
  int rank(Hunt h) => switch (h.status) {
    HuntStatus.laufend => 0,
    HuntStatus.geplant => 1,
    HuntStatus.beendet => 2,
    HuntStatus.abgesagt => 3,
  };
  return [...hunts]..sort((a, b) {
    final r = rank(a).compareTo(rank(b));
    if (r != 0) return r;
    // Offene Jagden: nächste zuerst; vergangene: neueste zuerst.
    return rank(a) <= 1 ? a.startsAt.compareTo(b.startsAt) : b.startsAt.compareTo(a.startsAt);
  });
}
