// GasCan

define(['Game', 'inventory/InventoryItem'],
       function (Game, InventoryItem) {

  var capacity = 5; // gallons

  var GasCan = function () {
    this.currentFuel = 0;
  };

  GasCan.prototype = {
    use: function () {
    },

    displayNode: function () {
      if (!this.display) {
        this.display = $("<div/>")
          .addClass('gascan')
          .append($("<span/>").addClass('readout'))
          .append($("<img/>").attr('src', this.image).attr('title', this.description));
        this.updateDisplay();
      }
      return this.display;
    },

    updateDisplay: function () {
      if (this.display) {
        var value = Math.round(this.currentFuel * 10) / 10;
        this.display.find('.readout').text(value + " Gal.");
      }
    },

    saveMetadata: function () {
      return {
        currentFuel: this.currentFuel
      };
    }
  };

  InventoryItem(GasCan, {
    width:  2, 
    height: 3, 
    image:  'gascan',
    clazz:  'GasCan',
    description: 'Gas Can'
  });

  return GasCan;
});