(function (P) {
  'use strict';
  // Equal progress is a joint live place, not an input-order advantage.
  // This presentation never changes race ordering or finish-time tie breakers.
  P.raceStanding = function (ranking) {
    var ranks = [], anchor = null;
    for (var i = 0; i < ranking.length; i++) {
      var marble = ranking[i];
      var tied = anchor && !anchor.finished && !marble.finished && Math.abs(anchor.y - marble.y) <= 1e-7;
      ranks.push(tied ? ranks[i - 1] : i + 1);
      if (!tied) anchor = marble;
    }
    return { ranks: ranks, leader: ranking.length && (ranking[0].finished || ranking.length === 1 || ranks[1] !== 1) ? ranking[0] : null };
  };
  // Presentation only: a candidate must stay ahead before the HUD switches.
  P.LiveLeader = function () { this.id = null; this.candidate = null; this.since = 0; this.lastTime = null; };
  P.LiveLeader.prototype.update = function (ranking, time) {
    var leader = P.raceStanding(ranking).leader;
    if (!ranking.length || (this.lastTime !== null && time < this.lastTime)) {
      this.id = null; this.candidate = null; this.since = time;
    }
    this.lastTime = time;
    if (!leader) { this.candidate = null; return ranking.find(function (m) { return m.id === this.id; }, this) || null; }
    if (leader.finished || !ranking.some(function (m) { return m.id === this.id; }, this)) {
      this.id = leader.id; this.candidate = null; return leader;
    }
    if (leader.id === this.id) this.candidate = null;
    else {
      if (this.candidate !== leader.id) { this.candidate = leader.id; this.since = time; }
      if (time - this.since >= .45) { this.id = leader.id; this.candidate = null; }
    }
    return ranking.find(function (m) { return m.id === this.id; }, this) || null;
  };
})(window.CosmicPinball);
