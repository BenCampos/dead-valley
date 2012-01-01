// a Web Worker for filling out the map

if (!this.require) {
  importScripts('../vendor/json2.js',
                '../vendor/underscore.js',
                '../vendor/require.js');
}

require(['TileMarshal', 'section-list', 'car-list', 'inventory-list', 'Vector'], function (TileMarshal, section_list, car_list, inventory_list, Vector) {

  MAX_ZOMBIES = 50;

  var Tile = function () {};
  Tile.prototype.tileOffset = 0;
  TileMarshal(Tile);

  // so we can get output from the worker
  var console = {
    log: function () {
      var message = {
        type:    'log',
        message: _(arguments).toArray()
      };
      postMessage(JSON.stringify(message));
    }
  };

  // load 'meta map' section tiles
  var sections = {
  };


  var carMap = [];
  var carColorMap = {};

  // create a distribution array of all the cars so that we can 
  // just pick a random element
  _.each(car_list, function (car, count) {
    for (var i = 0; i < count; i++) {
      carMap.push(car.name);
      carColorMap[car.name] = car.colors;
    }
  });

  // load the sections using AJAX
  var fetchMap = function (map, callback) {
    var req = new XMLHttpRequest();
    req.open('GET', '../maps/'+map+'.json', false);
    req.onreadystatechange = function () {
      if (req.readyState == 4) {
        callback(JSON.parse(req.responseText));
      }
    };
    req.send();
  };

  // sections set these variables with their data when loaded
  var map, roads, sprites, buildings;
  _(section_list).each(function (name) {

    fetchMap(name, function (map) {
      var mapData = map.map;
      var section = [];

      // convert the map into objects
      for (var i = 0; i < mapData.length; i++) {
        var tile = new Tile();
        tile.setFromString(mapData[i]);
        section[i] = tile;
      }

      sections[name]    = section;

      // save the section metadata on the map Array object
      section.name      = name;
      // these are from the imported script
      section.roads     = map.roads     || [];
      section.sprites   = map.sprites   || [];
      section.buildings = map.buildings || [];
    });

  });

  // fills a map's blank tiles wth random dirt and scrub
  var fillBlankTiles = function (tiles, width, scale) {
    var x, y, i, count;
    var total = tiles.length;
    var carCount = 0;

    var addCars = (Math.random() < 0.5) || // 50% chance of cars
                  scale === 0; // always have cars on the first seciton

    if (!tiles.sprites) {
      tiles.sprites = [];
    }

    for (i = 0; i < total; i++) {
      var tile = tiles[i];
      if (tile.tileOffset === 0) {
        var test = Math.random()

        if (test > 0.9) {

          tile.tileOffset = Math.floor(Math.random()*2) + 1;
          tile.tileFlip = Math.random() > 0.5;
          tile.tileRotate = 0;

        } else if (test < 0.01) {

          x = (i % width) * 60;
          y = Math.floor(i / width) * 60;
          var tree = {
            clazz: 'Tree',
            type: 'Tree' + (Math.floor(Math.random() * 3) + 1),
            pos: {
              x: x + 30,
              y: y + 30,
              rot: Math.floor(Math.random() * 360)
            }
          };

          tiles.sprites.push(JSON.stringify(tree));

        }

      } else if (tile.isRoad && addCars) {

        if (Math.random() < 0.05) {
          x = (i % width) * 60;
          y = Math.floor(i / width) * 60;
          addCar(x, y, tile, tiles);
          carCount++;
        }

      }
    }

    return carCount;
  };

  var addCar = function (x, y, tile, tiles) {
    var husk = Math.random() > 0.7;

    var pos = new Vector(x + Math.random() * 60,
                         y + Math.random() * 60);

    var rot;
    if (tile.tileOffset === 3) { // road side
      // align with road
      rot = tile.tileRotate * 90;
      if (!tile.flip) {
        rot -= 180;
      }
      // give a little
      rot += 10 - Math.floor(Math.random() * 20);
    } else if (tile.tileOffset === 15 ||
               tile.tileOffset === 33) { // parking space
      // align
      rot = tile.tileRotate * 90;
      if (!tile.flip) {
        rot -= 180;
      }
      // give a little
      rot += 5 - Math.floor(Math.random() * 10);

      pos.set(x + 30, y + 30);
      var move = new Vector(rot - 90);
      move.scale(30 + 10 * Math.random());
      if (tile.tileOffset === 33) {
        move.scale(-1);
      }
      pos.translate(move);
    } else {
      // random direction
      rot = Math.floor(Math.random() * 360);
    }

    var carType = carMap[Math.floor(Math.random() * carMap.length)];
    var carColorSelection = carColorMap[carType];
    var carColor = carColorSelection[Math.floor(Math.random() * carColorSelection.length)];

    // 25% chance it has some fuel
    var fuel = Math.random() < 0.25 ? Math.random() : 0;

    var car = {
      clazz: carType,
      setColor: carColor,
      pos: {
        x: pos.x,
        y: pos.y,
        rot: rot
      },
      health: husk ? -1 : Math.round(Math.random() * 100),
      stationary: husk,
      isCar: true,
      currentFuel: fuel,
      canSmoke: false // don't smoke until hit
    };

    if (husk) {
      car.inventory = null;
      car.mass    = Number.MAX_VALUE;
      car.inertia = 100000;
    }

    tiles.sprites.push(JSON.stringify(car));
  };

  var generateCount = function (countString) {
    var split = countString.split('d');
    var i, count = 0;
    if (split.length > 1) {
      var dice = parseInt(split[0]);
      var faces = parseInt(split[1]);
      for (i = 0; i < dice; i++) {
        count += Math.floor(Math.random() * faces) + 1;
      }
    } else {
      count = parseInt(countString);
    }
    return count;
  };

  var seedBuildings = function (buildings, scale) {
    var zombieChance = scale / 10;
    return _.map(buildings, function (building) {
      building = _.clone(building);

      var list = building.inventory;
      var random, count, i, inventory = [];

      if (typeof(list) === 'string') {
        // load inventory from the pre-defined lists
        list = inventory_list[list] || {};
      }

      _.each(list, function (item) {
        random = Math.random();
        if (random < item.percent) {
          count = generateCount(item.dice);
          if (item.stacked) {
            var stacked = _.clone(item);
            stacked.count = count;
            inventory.push(stacked);
          } else {
            for (i = 0; i < count; i++) {
              inventory.push(item);
            }
          }
        }
      });

      building.inventory = inventory;

      // zombies pop out!
      if (building.entrances.length &&
          Math.random() < zombieChance) {
        building.zombies = Math.round(scale) + 1;
      }

      return building;
    });
  };

  var seedZombies = function (tiles, carCount, width, scale) {
    var x, y, i, j, tileOffset, tile, zombie, count, groupsLength;
    var buildingCount = tiles.buildings.length;
    var maxZombies = buildingCount * 3 + carCount;
    var zombieCount = Math.round(Math.random() * maxZombies * scale);
    zombieCount = (zombieCount > MAX_ZOMBIES) ? MAX_ZOMBIES : zombieCount;
    var zombieGroups = [];

    // group the zombies up
    while (zombieCount) {
      count = Math.round(Math.random() * 10);
      if (count > zombieCount) {
        count = zombieCount;
      }
      zombieCount -= count;
      zombieGroups.push(count);
    }

    groupsLength = zombieGroups.length;

    for (i = 0; i < groupsLength; i++) {
      do {
        tileOffset = Math.floor(Math.random() * tiles.length);
        tile = tiles[tileOffset];
        if (tile.isRoad) {

          // add the number of zombies that are in this group
          count = zombieGroups[i];
          for (j = 0; j < count; j++) {
            x = (tileOffset % width) * 60;
            y = Math.floor(tileOffset / width) * 60;
            
            zombie = {
              clazz: 'Zombie',
              pos: {
                x: x + Math.random() * 60,
                y: y + Math.random() * 60,
                rot: 0
              }
            };

            tiles.sprites.push(JSON.stringify(zombie));
          }

        } else {
          tile = null;
        }
      } while (!tile);
    }
  };

  var loadSection = function (config) {
    // fills the map with the given section
    var section = sections[config.sectionName];
    var sectionLength = section.length;
    var mapLength = config.width * config.height;
    var tiles = [];
    for (var i = 0; i < mapLength; i++) {
      tiles[i] = _.clone(section[i % sectionLength]);
    }
    tiles.roads     = section.roads;
    tiles.sprites   = section.sprites;
    tiles.buildings = section.buildings;
    return tiles;
  };

  var cloneSection = function (section) {
    var tiles = [];
    for (var i = 0; i < section.length; i++) {
      tiles[i] = _.clone(section[i]);
    }
    tiles.roads     = _.clone(section.roads);
    tiles.sprites   = _.clone(section.sprites);
    tiles.buildings = _.clone(section.buildings);
    return tiles;
  };

  var getRandomSection = function (incomingRoads) {
    var canidates = [];

    for (var name in sections) {
      if (sections.hasOwnProperty(name)) {
        var section = sections[name];

        var match = true;
        for (var dir in section.roads) {
          if (incomingRoads.hasOwnProperty(dir) &&
              (incomingRoads[dir] !== undefined) &&
              (incomingRoads[dir] !== section.roads[dir])) {
            match = false;
            break;
          }
        }

        if (match) {
          canidates.push(section);
        }
      }
    }

    var choice = (canidates.length) ?
      canidates[Math.floor(Math.random() * canidates.length)] :
      sections['blank']; // nothing is better than really nothing

    console.log(choice.name);
    return cloneSection(choice);
  };

  onmessage = function (e) {
    var config = JSON.parse(e.data);

    var x = config.position.x;
    var y = config.position.y;
    var distance = Math.sqrt(x*x + y*y);
    // how much to scale the zombie infestation
    var scale = distance / 50;

    var tiles = (config.sectionName) ?
                  loadSection(config) :
                  getRandomSection(config.roads);

    var carCount = fillBlankTiles(tiles, config.width, scale);

    tiles.buildings = seedBuildings(tiles.buildings, scale);

    seedZombies(tiles, carCount, config.width, scale);

    var message = {
      type:      'newtiles',
      tiles:     _(tiles).map(function (t) { return t.toString(); }).join(''),
      roads:     tiles.roads,
      sprites:   tiles.sprites,
      buildings: tiles.buildings,
      position:  config.position
    };

    postMessage(JSON.stringify(message));
  };

});