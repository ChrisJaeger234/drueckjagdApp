import 'package:drueckjagd_app/app/config/app_config.dart';
import 'package:drueckjagd_app/app/router/routes.dart';
import 'package:drueckjagd_app/core/geo/geo_point.dart';
import 'package:drueckjagd_app/core/geo/geojson.dart';
import 'package:drueckjagd_app/features/map/domain/revier_boundary.dart';
import 'package:drueckjagd_app/features/map/domain/waypoint.dart';
import 'package:drueckjagd_app/features/map/domain/waypoint_category.dart';
import 'package:drueckjagd_app/features/map/presentation/map_style.dart';
import 'package:flutter_test/flutter_test.dart';

/// Quadrat mit ca. 1 km Kantenlänge um den Kartenmittelpunkt.
const _square = [
  [7.24, 51.165],
  [7.2543, 51.165],
  [7.2543, 51.174],
  [7.24, 51.174],
  [7.24, 51.165],
];

void main() {
  group('GeoJson.polygons', () {
    test('liest Polygon, MultiPolygon, Feature und FeatureCollection', () {
      final polygon = {
        'type': 'Polygon',
        'coordinates': [_square],
      };
      expect(GeoJson.polygons(polygon), hasLength(1));
      expect(GeoJson.polygons(polygon).single.outer, hasLength(4), reason: 'Schlusspunkt wird entfernt');

      final multi = {
        'type': 'MultiPolygon',
        'coordinates': [
          [_square],
          [_square],
        ],
      };
      expect(GeoJson.polygons(multi), hasLength(2));

      final feature = {'type': 'Feature', 'properties': <String, dynamic>{}, 'geometry': polygon};
      final collection = {
        'type': 'FeatureCollection',
        'features': [
          feature,
          {
            'type': 'Feature',
            'geometry': {
              'type': 'Point',
              'coordinates': [7.2, 51.1],
            },
          },
        ],
      };
      expect(GeoJson.polygons(feature), hasLength(1));
      expect(GeoJson.polygons(collection), hasLength(1), reason: 'Punkte werden übersprungen');
    });

    test('überspringt Kaputtes statt abzustürzen', () {
      expect(GeoJson.polygons(null), isEmpty);
      expect(GeoJson.polygons({'type': 'Polygon', 'coordinates': 'x'}), isEmpty);
      expect(
        GeoJson.polygons({
          'type': 'Polygon',
          'coordinates': [
            [
              [7, 51],
              [8, 51],
            ],
          ],
        }),
        isEmpty,
      );
      expect(
        GeoJson.polygons({
          'type': 'Polygon',
          'coordinates': [
            [
              [700, 51],
              [8, 51],
              [8, 52],
            ],
          ],
        }),
        isEmpty,
      );
    });

    test('liest Löcher', () {
      final p = GeoJson.polygons({
        'type': 'Polygon',
        'coordinates': [
          _square,
          [
            [7.245, 51.168],
            [7.247, 51.168],
            [7.247, 51.170],
            [7.245, 51.168],
          ],
        ],
      }).single;
      expect(p.holes, hasLength(1));
    });
  });

  group('GeoJson Hilfen', () {
    final polygons = GeoJson.polygons({
      'type': 'Polygon',
      'coordinates': [_square],
    });

    test('Fläche in Hektar (≈ 1 km × 1 km)', () {
      expect(GeoJson.areaHectares(polygons), closeTo(100, 3));
    });

    test('Punkt im Polygon', () {
      expect(GeoJson.contains(polygons, const GeoPoint(51.168, 7.247)), isTrue);
      expect(GeoJson.contains(polygons, const GeoPoint(51.18, 7.247)), isFalse);
    });

    test('polygon() schließt den Ring und schreibt [lng, lat]', () {
      final json = GeoJson.polygon(const [GeoPoint(51, 7), GeoPoint(51, 8), GeoPoint(52, 8)]);
      final ring = (json['coordinates'] as List).single as List;
      expect(ring, hasLength(4));
      expect(ring.first, [7.0, 51.0]);
      expect(ring.last, ring.first);
      expect(() => GeoJson.polygon(const [GeoPoint(51, 7), GeoPoint(51, 8)]), throwsArgumentError);
    });

    test('Umriss und Mittelpunkt', () {
      final b = GeoBounds.fromPoints(GeoJson.allPoints(polygons))!;
      expect(b.south, 51.165);
      expect(b.east, 7.2543);
      expect(b.center.latitude, closeTo(51.1695, 1e-9));
      expect(GeoBounds.fromPoints(const []), isNull);
    });
  });

  group('Modelle', () {
    test('Waypoint aus JSON und Entwurf nach JSON', () {
      final w = Waypoint.fromJson({
        'id': 'w1',
        'revier_id': 'r1',
        'created_by': 'u1',
        'name': 'Bock am Bach',
        'description': '',
        'category': 'drueckjagdbock',
        'latitude': 51.1,
        'longitude': 7.2,
      });
      expect(w.category, WaypointCategory.drueckjagdbock);
      expect(w.location, const GeoPoint(51.1, 7.2));

      const draft = WaypointDraft(
        name: '  Kanzel 3 ',
        category: WaypointCategory.kanzel,
        location: GeoPoint(51.2, 7.3),
        description: ' neu ',
      );
      expect(draft.toJson(), {
        'name': 'Kanzel 3',
        'description': 'neu',
        'category': 'kanzel',
        'latitude': 51.2,
        'longitude': 7.3,
      });
    });

    test('RevierBoundary liest das normalisierte MultiPolygon', () {
      final b = RevierBoundary.fromJson({
        'id': 'b1',
        'revier_id': 'r1',
        'updated_at': '2026-11-04T10:00:00Z',
        'boundary_data': {
          'type': 'MultiPolygon',
          'coordinates': [
            [_square],
          ],
        },
      });
      expect(b.polygons, hasLength(1));
      expect(b.areaHectares, closeTo(100, 3));
    });
  });

  group('Kartenquelle', () {
    test('mit Mapbox-Token: Mapbox-Kacheln je Stil', () {
      final s = MapTileSource.forStyle(MapStyle.satellite, mapboxToken: 'pk.abc');
      expect(s.isMapbox, isTrue);
      expect(s.urlTemplate, contains('satellite-streets-v12'));
      expect(s.urlTemplate, endsWith('access_token=pk.abc'));
      expect(s.attribution, contains('© Mapbox'));
    });

    test('ohne Token: OpenStreetMap', () {
      final s = MapTileSource.forStyle(MapStyle.outdoors, mapboxToken: '');
      expect(s.isMapbox, isFalse);
      expect(s.urlTemplate, contains('openstreetmap'));
    });

    test('geheimer Mapbox-Token wird abgelehnt', () {
      const base = AppConfig(supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'sb_publishable_x');
      expect(base.isValid, isTrue);
      expect(base.hasMapbox, isFalse);
      const secret = AppConfig(
        supabaseUrl: 'https://x.supabase.co',
        supabaseAnonKey: 'sb_publishable_x',
        mapboxAccessToken: 'sk.geheim',
      );
      expect(secret.validate(), [contains('geheimer Token')]);
    });
  });

  test('Stand-Link von der Karte trägt Koordinaten und Einrichtung', () {
    final uri = Uri.parse(
      Routes.standCreate('h1', at: const GeoPoint(51.1686820, 7.2474948), waypointId: 'w1', label: 'Bock 1'),
    );
    expect(uri.path, '/hunts/h1/stands/new');
    expect(uri.queryParameters, {'lat': '51.1686820', 'lng': '7.2474948', 'waypoint': 'w1', 'label': 'Bock 1'});
    expect(Routes.standCreate('h1'), '/hunts/h1/stands/new');
  });
}
