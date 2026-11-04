import 'package:drueckjagd_app/core/errors/app_exception.dart';
import 'package:drueckjagd_app/core/geo/geo_point.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt_enums.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt_participant.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt_report.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt_stand.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt_zone.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunts_repository.dart';

/// In-Memory-Jagden für Widget-Tests. Berechtigungen prüft hier niemand –
/// die echten Regeln testen pgTAP und die Integrationstests.
class FakeHuntsRepository implements HuntsRepository {
  FakeHuntsRepository({required this.currentUserId, this.groupNames = const {}});

  final String currentUserId;
  final Map<String, String> groupNames;
  final Map<String, Hunt> hunts = {};
  final List<HuntParticipant> participants = [];
  final List<HuntStand> stands = [];
  final List<HuntZone> zones = [];
  final List<HuntReport> reports = [];
  var _seq = 0;

  String _id(String prefix) => '$prefix-${++_seq}';

  static final _ts = DateTime.utc(2026, 11, 4, 6);

  Hunt _build(String id, String groupId, HuntDraft d, {String? createdBy}) => Hunt(
    id: id,
    groupId: groupId,
    revierId: d.revierId,
    title: d.title.trim(),
    description: d.description,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    status: d.status,
    meetingPoint: d.meetingPoint,
    meetingLocation: d.meetingLocation,
    gameRelease: d.gameRelease,
    safetyNotes: d.safetyNotes,
    emergencyInfo: d.emergencyInfo,
    selfJoin: d.selfJoin,
    createdBy: createdBy,
    createdAt: _ts,
    updatedAt: _ts,
    groupName: groupNames[groupId],
  );

  /// Legt eine Jagd im Namen von [createdBy] an (Test-Vorbereitung).
  Hunt seed({required String groupId, required String createdBy, required HuntDraft draft}) {
    final h = _build(_id('hunt'), groupId, draft, createdBy: createdBy);
    hunts[h.id] = h;
    participants.add(
      HuntParticipant(
        id: _id('part'),
        huntId: h.id,
        userId: createdBy,
        role: HuntRole.jagdleiter,
        displayName: 'Waldemar',
      ),
    );
    return h;
  }

  @override
  Future<List<Hunt>> fetchAll() async => hunts.values.toList();

  @override
  Future<List<Hunt>> fetchForGroup(String groupId) async => hunts.values.where((h) => h.groupId == groupId).toList();

  @override
  Future<Hunt> fetchById(String huntId) async =>
      hunts[huntId] ?? (throw const AppException('nicht gefunden', kind: AppErrorKind.notFound));

  @override
  Future<Hunt> create({required String groupId, required HuntDraft draft}) async =>
      seed(groupId: groupId, createdBy: currentUserId, draft: draft);

  @override
  Future<Hunt> update({required String huntId, required HuntDraft draft}) async {
    final old = hunts[huntId]!;
    return hunts[huntId] = _build(huntId, old.groupId, draft, createdBy: old.createdBy);
  }

  @override
  Future<Hunt> setStatus({required String huntId, required HuntStatus status}) async {
    final h = hunts[huntId]!;
    return hunts[huntId] = _build(
      huntId,
      h.groupId,
      HuntDraft(title: h.title, startsAt: h.startsAt, status: status, selfJoin: h.selfJoin),
      createdBy: h.createdBy,
    );
  }

  @override
  Future<void> delete(String huntId) async => hunts.remove(huntId);

  @override
  Future<List<HuntParticipant>> fetchParticipants(String huntId) async =>
      participants.where((p) => p.huntId == huntId).toList();

  HuntParticipant _put(HuntParticipant p) {
    participants.removeWhere((o) => o.id == p.id);
    participants.add(p);
    return p;
  }

  @override
  Future<HuntParticipant> join({required String huntId, required HuntRole role, String note = ''}) async => _put(
    HuntParticipant(id: _id('part'), huntId: huntId, userId: currentUserId, role: role, note: note, displayName: 'Ich'),
  );

  @override
  Future<HuntParticipant> addParticipant({
    required String huntId,
    required String userId,
    required HuntRole role,
  }) async => _put(HuntParticipant(id: _id('part'), huntId: huntId, userId: userId, role: role, displayName: userId));

  HuntParticipant _copy(
    HuntParticipant p, {
    HuntRole? role,
    String? note,
    String? standId,
    String? zoneId,
    bool assign = false,
  }) => HuntParticipant(
    id: p.id,
    huntId: p.huntId,
    userId: p.userId,
    role: role ?? p.role,
    note: note ?? p.note,
    standId: assign ? standId : p.standId,
    zoneId: assign ? zoneId : p.zoneId,
    displayName: p.displayName,
  );

  @override
  Future<HuntParticipant> updateParticipant({required String participantId, HuntRole? role, String? note}) async =>
      _put(_copy(participants.firstWhere((p) => p.id == participantId), role: role, note: note));

  @override
  Future<HuntParticipant> assign({required String participantId, String? standId, String? zoneId}) async => _put(
    _copy(participants.firstWhere((p) => p.id == participantId), standId: standId, zoneId: zoneId, assign: true),
  );

  @override
  Future<void> removeParticipant(String participantId) async => participants.removeWhere((p) => p.id == participantId);

  @override
  Future<List<HuntZone>> fetchZones(String huntId) async => zones.where((z) => z.huntId == huntId).toList();

  @override
  Future<HuntZone> createZone({
    required String huntId,
    required String name,
    required HuntZoneKind kind,
    required Map<String, dynamic> boundary,
    String description = '',
    String? color,
  }) async {
    final z = HuntZone(id: _id('zone'), huntId: huntId, name: name, kind: kind, boundary: boundary);
    zones.add(z);
    return z;
  }

  @override
  Future<void> deleteZone(String zoneId) async => zones.removeWhere((z) => z.id == zoneId);

  @override
  Future<List<HuntStand>> fetchStands(String huntId) async => stands.where((s) => s.huntId == huntId).toList();

  @override
  Future<HuntStand> createStand({
    required String huntId,
    required String label,
    required double latitude,
    required double longitude,
    String? waypointId,
    String? zoneId,
    String description = '',
    int sortOrder = 0,
  }) async {
    final s = HuntStand(
      id: _id('stand'),
      huntId: huntId,
      label: label.trim(),
      location: GeoPoint(latitude, longitude),
      waypointId: waypointId,
      zoneId: zoneId,
      description: description,
      sortOrder: sortOrder,
    );
    stands.add(s);
    return s;
  }

  @override
  Future<HuntStand> updateStand({
    required String standId,
    required String label,
    required double latitude,
    required double longitude,
    String? waypointId,
    String? zoneId,
    String description = '',
    int sortOrder = 0,
  }) async {
    final i = stands.indexWhere((s) => s.id == standId);
    return stands[i] = HuntStand(
      id: standId,
      huntId: stands[i].huntId,
      label: label,
      location: GeoPoint(latitude, longitude),
      zoneId: zoneId,
      description: description,
      sortOrder: sortOrder,
    );
  }

  @override
  Future<void> deleteStand(String standId) async {
    stands.removeWhere((s) => s.id == standId);
    for (final p in participants.where((p) => p.standId == standId).toList()) {
      _put(_copy(p, standId: null, zoneId: p.zoneId, assign: true));
    }
  }

  @override
  Future<List<HuntReport>> fetchReports(String huntId) async => reports.where((r) => r.huntId == huntId).toList();

  @override
  Future<HuntReport> createReport(HuntReportDraft d) async {
    final r = HuntReport(
      id: _id('report'),
      huntId: d.huntId,
      kind: d.kind,
      species: d.species.trim(),
      count: d.count,
      standId: d.standId,
      note: d.note,
      occurredAt: DateTime.utc(2026, 11, 21, 9, 15),
      reporterId: currentUserId,
      reporterName: 'Ich',
    );
    reports.insert(0, r);
    return r;
  }

  @override
  Future<HuntReport> setReportResolved({required String reportId, required bool resolved}) async {
    final i = reports.indexWhere((r) => r.id == reportId);
    final o = reports[i];
    return reports[i] = HuntReport(
      id: o.id,
      huntId: o.huntId,
      kind: o.kind,
      species: o.species,
      count: o.count,
      standId: o.standId,
      note: o.note,
      occurredAt: o.occurredAt,
      reporterId: o.reporterId,
      reporterName: o.reporterName,
      resolvedAt: resolved ? _ts : null,
      resolvedBy: resolved ? currentUserId : null,
    );
  }

  @override
  Future<void> deleteReport(String reportId) async => reports.removeWhere((r) => r.id == reportId);
}
