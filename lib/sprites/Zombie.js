define(["Vector", "Sprite", "Collidable", "Game", "fx/BulletHit", "fx/BloodSplatter", "fx/TireTracks"],
       function (Vector, Sprite, Collidable, Game, BulletHit, BloodSplatter, TireTracks) {

  var LEFT  = true;  // true, meaning do flip the sprite
  var RIGHT = false;

  var MIN_SPEED                      = 11;   // 5 MPH
  var MAX_SPEED                      = 44;   // 20 MPH
  var WALKING_ANIMATION_FRAME_RATE   = 2;    // in pixels
  var ATTACKING_ANIMATION_FRAME_RATE = 0.10; // in seconds
  var DYING_ANIMATION_FRAME_RATE     = 0.25; // in seconds
  var DAMAGE_WINDOW                  = 0.02; // in seconds
  var SCAN_TIMEOUT_RESET             = 1;    // in seconds
  var MAX_WAIT_TIME                  = 20;   // in seconds
  var MAX_RANGE                      = 400;  // how far a Zombie can see - in pixels
  var WANDER_DISTANCE                = 200;  // how far a Zombie wanders in one direction - in pixels
  var HEALTH                         = 6;

  var bulletHit = new BulletHit({
    color:     'green',
    minLength: 10,
    range:     15,
    size:      2
  });

  var headshotBulletHit = new BulletHit({
    color:     'green',
    minLength: 15,
    range:     20,
    size:      2
  });

  var Zombie = function () {
    this.init('Zombie');

    // set some counters randomly so not all zombies are in sync

    this.target                = null;
    this.targetSprite          = null;
    this.seeTarget             = false;
    this.direction             = RIGHT;
    this.walking               = false;
    this.walkingFrame          = 0;
    this.walkingFrameCounter   = WALKING_ANIMATION_FRAME_RATE * Math.random();
    this.attackingFrame        = 0;
    this.attackingFrameCounter = 0;
    this.scanTimeout           = SCAN_TIMEOUT_RESET * Math.random();
    this.waitTimeout           = MAX_WAIT_TIME * Math.random();

    this.currentState          = this.states.wandering;

    this.mass                  = 0.001;
    this.inertia               = 1;

    this.health                = HEALTH;

    this.tireTrackLength       = 30;

    this.prone                 = false;

    this.originalCenterX       = this.center.x;

    this.moseySpeed  = MIN_SPEED + Math.random();
    this.attackSpeed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
  };
  Zombie.prototype = new Sprite();

  Zombie.prototype.isZombie = true;

  // draw the 'dead' zombie
  Zombie.prototype.modifyForPronePosition = function () {
    // so we render correctly
    this.node.width(30);
    this.imageOffset.x  = 10;
    this.center.y      -= 6;
    this.pos.y         -= 6;
  };

  Zombie.prototype.draw = function (delta) {
    // hack so the sprite is placed correctly when its flipped
    this.center.x = (this.direction == RIGHT) ? this.originalCenterX : this.originalCenterX + 4;

    if (this.health <= 0) {
      // reusing the walking frame and counter
      if (this.walkingFrameCounter < 0.5) {
        this.walkingFrameCounter += delta;
        this.drawTile(10, 0);
      } else {
        if (!this.prone) {
          this.prone = true;
          this.modifyForPronePosition();
        }
        this.drawTile(11, 0);
      }
      return;
    }

    if (this.walking) {
      this.walkingFrameCounter += delta * this.vel.magnitude();
      if (this.walkingFrameCounter > WALKING_ANIMATION_FRAME_RATE) {
        this.walkingFrameCounter = 0;
        this.walkingFrame = (this.walkingFrame + 1) % 4; // four frames
      }
      this.drawTile(this.walkingFrame+1, 0); // starts at 1
    } else {
      this.drawTile(0, 0); // standing
    }
    
    // arms
    if (this.currentState === this.states.attacking ||
        this.attackingFrame > 0) {  // want to finish his animation
      this.attackingFrameCounter += delta;
      if (this.attackingFrameCounter > ATTACKING_ANIMATION_FRAME_RATE) {
        this.attackingFrameCounter = 0;
        this.attackingFrame = (this.attackingFrame + 1) % 4; // four frames
      }
      this.drawTile(this.attackingFrame+6, 1); // starts at 6
    } else if (this.walking) {
      this.drawTile(6, 1); // walking arms
    } else {
      this.drawTile(5, 1); // standing arms
    }
  };

  Zombie.prototype.lookForTargets = function () {
    this.seeTarget = false;
    // dude is the only target for now
    // TODO limit the distance the zombie can see
    var target = Game.dude.driving || Game.dude;
    if (target &&
	target.visible &&
	this.pos.subtract(target.pos).magnitude() < MAX_RANGE) {
      var see = false;
      Game.map.rayTrace(this.pos, target.pos, MAX_RANGE, function (collision, sprite) {
	if (sprite === target) {
	  see = true;
	}
       
        // look past other zombies
        // keep going if there isn't a collision
        // stop if you see the dude
        return sprite.isZombie || !collision || see;
      });
      if (see) {
        this.setTarget(target);
      }
    }
  };

  Zombie.prototype.setTarget = function (target) {
    this.target       = target.pos.clone();
    this.targetVel    = target.vel.clone();
    this.seeTarget    = true;
    this.targetSprite = target;
  };

  Zombie.prototype.clearTarget = function () {
    this.target       = null;
    this.targetSprite = null;
    this.targetVel    = null;
    this.seeTarget    = false;
  };

  Zombie.prototype.preMove = function (delta) {
    if (this.health <= 0) {
      return;
    }

    this.scanTimeout -= delta;
    if (this.scanTimeout < 0) {
      this.scanTimeout = SCAN_TIMEOUT_RESET;
      this.lookForTargets();
    }

    if (this.seeTarget) {
      this.currentState = this.states.stalking;
    }

    this.currentState.call(this, delta);

    if (this.vel.x) {
      this.direction = (this.vel.x > 0) ? RIGHT : LEFT;
    }
  };

  Zombie.prototype.hit = function (other) {
    // are we in the window of opportunity?
    if (this.attackingFrame === 3 && // arm stretched
        other.takeDamage &&          // can take damage
        this.attackingFrameCounter > ATTACKING_ANIMATION_FRAME_RATE - DAMAGE_WINDOW) {

      var which = (this.direction === RIGHT) ? 1 : -1;
      var add = new Vector(which * this.tileWidth, 0);
      other.takeDamage(1, this.pos.add(add), this);
    }
  };

  Zombie.prototype.findEndOfObstacle = function (obstacle, point, normal) {
    var parallel = normal.normal();
    var dot = parallel.dotProduct(this.vel);
    var newDir = parallel.scale(dot).normalize();
    // which of the obstacle's points is closest in line which the direction
    // we want to go?
    var points = obstacle.transformedPoints();
    var length = points.length;
    var i, dot, max = 0;
    var point, testPoint;
    for (i = 0; i < length; i++) {
      testPoint = points[i].subtract(obstacle.pos);
      dot = testPoint.dotProduct(newDir);
      max = Math.max(max, dot);
      if (dot === max) {
        point = testPoint;
      }
    }
    var extra = point.clone().normalize().scale(20);
    newDir.scale(20);

    // new target
    this.target = point.add(extra).translate(newDir).translate(obstacle.pos);
  };

  Zombie.prototype.collision = function (other, point, normal, vab) {
    // zombies don't rotate
    this.pos.rot = 0;
    this.vel.rot = 0;

    if (other === Game.dude ||
        other === Game.dude.driving ||
        (other === Game.dude.inside &&
         this.currentState === this.states.pounding)) {
      this.currentState = this.states.attacking;

      this.hit(other);
    } else if (this.currentState !== this.states.attacking &&
               !other.isZombie &&
               this.vel.dotProduct(normal) < 0) {
      this.lastState = this.currentState;
      this.lastTarget = this.target;
      this.currentState = this.states.avoiding;
      this.findEndOfObstacle(other, point, normal);
    }

    var magnitude = vab.magnitude();
    if (magnitude > 132) { // 30 MPH
      this.takeDamage(Math.floor(magnitude / 88)); // every 20 MPH
    }
  };

  Zombie.prototype.moveToward = function (pos, speed) {
    var mosey = pos.subtract(this.pos).normalize().scale(speed || this.moseySpeed);
    this.vel.set(mosey);
  };

  Zombie.prototype.states = {
    waiting: function (delta) {
      this.walking = false;
      this.vel.scale(0);

      this.waitTimeout -= delta;
      if (this.waitTimeout < 0) {
        // reset wait period
        this.waitTimeout = MAX_WAIT_TIME * Math.random();
        this.currentState = this.states.wandering;
      }
    },
    wandering: function () {
      this.walking = true;

      // create a random target to shoot for
      var direction = new Vector(Math.random() * 360);
      this.target = this.pos.add(direction.scale(Math.random() * WANDER_DISTANCE));

      this.currentState = this.states.searching;
    },
    searching: function () {
      this.walking = true;

      if (this.target) {
        var distance = this.target.subtract(this.pos).magnitude();
        if (distance > 5) {
          this.moveToward(this.target);
        } else {
          // got to the target
          this.target = null;
          this.vel.scale(0);
        }
      } else if (this.targetVel) {
        // move in the last direction seen for a bit
        this.target = this.targetVel.normalize().scale(300).translate(this.pos);
        this.targetVel = null;
      } else {
        this.currentState = this.states.waiting;
      }
    },
    avoiding: function () {
      this.walking = true;

      if (this.target) {
        var distance = this.target.subtract(this.pos).magnitude();
        if (distance > 5) {
          var speed = (this.lastState == this.states.stalking) ? this.attackSpeed : this.moseySpeed;
          this.moveToward(this.target, speed);
        } else {
          // got to the target
          this.target       = this.lastTarget;
          this.lastTarget   = null;
          this.currentState = this.lastState || this.states.waiting;
          this.lastState    = null;
        }
      } else {
        this.currentState = this.states.waiting;
      }
    },
    stalking: function () {
      this.walking = true;

      if (!this.target) {
        this.currentState = this.states.searching;
        return;
      }

      var distance = this.target.subtract(this.pos).magnitude();
      if (distance > 5) {
        this.moveToward(this.target, this.attackSpeed);
      } else {
        // got to the target
        this.target = null;
        this.currentState = this.states.searching;
      }

      if (this.targetSprite.inside) {
        this.currentState = this.states.pounding;
      }
    },
    pounding: function () {
      if (this.targetSprite.inside) {
        this.moveToward(this.targetSprite.inside.pos);
      } else {
        this.currentState = this.states.stalking;
      }
    },
    attacking: function () {
      if (Game.dude.inside) {
        this.hit(Game.dude.inside);
      }
      this.vel.scale(0);
      this.walking = false;
    },
    thriller: function () {
      // TODO hehe yes
    }
  };

  Zombie.prototype.bulletHit = function (hit, damage) {
    var vec = hit.point.subtract(this.pos);

    if (vec.y < -7 &&            // in the area of the head
        Math.abs(vec.x) === 10) { // only from the sides

      // HEADSHOT!
      // 5-10 times more damaging
      var scale = Math.round(5 + Math.random() * 5);
      this.takeDamage(damage * scale);
      headshotBulletHit.fireSparks(hit);
    } else {
      this.takeDamage(damage);
      bulletHit.fireSparks(hit);
    }
  };

  Zombie.prototype.takeDamage = function (damage) {
    if (this.health > 0) {
      // splat zombie blood at his feet
      var splatPos = this.pos.clone().translate({x:0, y:4});
      BloodSplatter.splat(splatPos, 'green', damage);
      this.health -= damage;
      if (this.health <= 0) {
        // DEEEEEED
        this.vel.scale(0);
        this.walkingFrameCounter = 0;
        this.collidable = false;
        this.shouldSave = false;
        this.z--; // always underfoot
        // set the points for the now prone zombie
        this.points = [
          new Vector(-15, 0),
          new Vector( 15, 0),
          new Vector( 15, 9),
          new Vector(-15, 9)
        ];
      }
    }
  };

  Zombie.prototype.saveMetadata = function () {
    var metadata = Sprite.prototype.saveMetadata.call(this);
    metadata.health = this.health;
    return metadata;
  };

  Collidable(Zombie);

  Game.events.subscribe('firearm discharged,explosion', function () {
    // wake up all the zombies
    _.each(Game.sprites, function (sprite) {
      if (sprite.isZombie) {
        sprite.setTarget(Game.dude);
      }
    });
  });

  return Zombie;
});