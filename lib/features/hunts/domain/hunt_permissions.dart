import '../../groups/domain/group_role.dart';
import 'hunt.dart';
import 'hunt_enums.dart';
import 'hunt_participant.dart';
import 'hunt_report.dart';

/// Spiegelt die Regeln aus Migration 0010, damit die App nur Aktionen anbietet,
/// die der Server auch erlaubt. Durchgesetzt werden sie ausschließlich in der
/// Datenbank (RLS + Trigger).
class HuntPermissions {
  const HuntPermissions({required this.userId, required this.groupRole, this.participation});

  final String userId;

  /// Rolle in der Gruppe der Jagd; `null` = kein Mitglied.
  final GroupRole? groupRole;

  /// Eigene Teilnahme; `null` = nicht eingetragen.
  final HuntParticipant? participation;

  bool get isGroupAdmin => groupRole == GroupRole.owner || groupRole == GroupRole.admin;

  /// Jagd, Zonen und Stände bearbeiten, Stände/Zonen zuteilen, Teilnehmer verwalten.
  bool get canManage => isGroupAdmin || (participation?.role.isLead ?? false);

  bool get canDelete => isGroupAdmin;

  /// Jagdleiter ernennen: Owner/Admin oder selbst Jagdleiter (nicht Ansteller).
  bool get canAppointLeader => isGroupAdmin || participation?.role == HuntRole.jagdleiter;

  bool canSelfJoin(Hunt hunt) => groupRole != null && participation == null && hunt.canSelfJoin;

  bool get canReport => groupRole != null;

  bool canEditReport(HuntReport report) => groupRole != null && (report.reporterId == userId || canManage);
}
