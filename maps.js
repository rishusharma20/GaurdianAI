const MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const MapsManager = {
  isMock: !MAPS_API_KEY,

  async calculateTravelTime(origin, destination) {
    if (this.isMock) {
      // Return simulated travel time (in minutes) and distance
      return {
        durationMins: 25,
        distanceStr: '12.4 km',
        trafficDelayMins: 5
      };
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&departure_time=now&key=${MAPS_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.rows && data.rows[0] && data.rows[0].elements && data.rows[0].elements[0]) {
        const element = data.rows[0].elements[0];
        if (element.status === 'OK') {
          const durationVal = element.duration_in_traffic ? element.duration_in_traffic.value : element.duration.value;
          return {
            durationMins: Math.ceil(durationVal / 60),
            distanceStr: element.distance.text,
            trafficDelayMins: element.duration_in_traffic ? Math.ceil((element.duration_in_traffic.value - element.duration.value) / 60) : 0
          };
        }
      }
      return { durationMins: 20, distanceStr: 'Unknown', trafficDelayMins: 0 };
    } catch (e) {
      console.error("Maps API error, falling back:", e);
      return { durationMins: 20, distanceStr: 'Unknown', trafficDelayMins: 0 };
    }
  }
};

module.exports = MapsManager;
