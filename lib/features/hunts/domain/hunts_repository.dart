import 'hunt.dart';
import 'hunt_enums.dart';
import 'hunt_participant.dart';
import 'hunt_report.dart';
import 'hunt_stand.dart';
import 'hunt_zone.dart';

/// Alles rund um eine Jagd. Berechtigungen prüft der Server.
abstract interface class HuntsRepository {
  /// Alle Jagden, die der Benutzer sehen darf, nach Beginn absteigend.
  Future<List<Hunt>> fetchAll();

  Future<List<Hunt>> fetchForGroup(String groupId);

  Future<Hunt> fetchById(String huntId);

  /// Legt eine Jagd an; der Ersteller wird automatisch Jagdleiter.
  Future<Hunt> create({required String groupId, required HuntDraft draft});

  Future<Hunt> update({required String huntId, required HuntDraft draft});

  Future<Hunt> setStatus({required String huntId, required HuntStatus status});

  Future<void> delete(String huntId);

  // Teilnehmer
  Future<List<HuntParticipant>> fetchParticipants(String huntId);

  /// Sich selbst eintragen (Rolle ohne Leitungsrechte).
  Future<HuntParticipant> join({required String huntId, required HuntRole role, String note = ''});

  /// Jagdleitung trägt ein Gruppenmitglied ein.
  Future<HuntParticipant> addParticipant({required String huntId, required String userId, required HuntRole role});

  Future<HuntParticipant> updateParticipant({required String participantId, HuntRole? role, String? note});

  /// Stand und/oder Zone zuteilen (`null` entfernt die Zuteilung).
  Future<HuntParticipant> assign({required String participantId, String? standId, String? zoneId});

  /// Austragen (eigene Teilnahme) bzw. entfernen (Jagdleitung).
  Future<void> removeParticipant(String participantId);

  // Zonen
  Future<List<HuntZone>> fetchZones(String huntId);

  Future<HuntZone> createZone({
    required String huntId,
    required String name,
    required HuntZoneKind kind,
    required Map<String, dynamic> boundary,
    String description = '',
    String? color,
  });

  Future<void> deleteZone(String zoneId);

  // Stände
  Future<List<HuntStand>> fetchStands(String huntId);

  Future<HuntStand> createStand({
    required String huntId,
    required String label,
    required double latitude,
    required double longitude,
    String? waypointId,
    String? zoneId,
    String description = '',
    int sortOrder = 0,
  });

  Future<HuntStand> updateStand({
    required String standId,
    required String label,
    required double latitude,
    required double longitude,
    String? waypointId,
    String? zoneId,
    String description = '',
    int sortOrder = 0,
  });

  Future<void> deleteStand(String standId);

  // Meldungen
  Future<List<HuntReport>> fetchReports(String huntId);

  Future<HuntReport> createReport(HuntReportDraft draft);

  /// Nachsuche/Bergung als erledigt markieren oder wieder öffnen.
  Future<HuntReport> setReportResolved({required String reportId, required bool resolved});

  Future<void> deleteReport(String reportId);
}
