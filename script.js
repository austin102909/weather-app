const elements = {
  locationInput: document.getElementById('location'),
  autocomplete: document.getElementById('autocomplete-dropdown'),
  locationError: document.getElementById('location-error'),
  starter: document.getElementById('starter-screen'),
  result: document.getElementById('weather-result'),
  tabs: document.getElementById('tabs'),
  settings: document.getElementById('settings-section'),
  alerts: document.getElementById('alerts-section'),
  now: document.getElementById('now-section'),
  hourly: document.getElementById('hourly-section'),
  sevenDay: document.getElementById('7-day-section'),
  header: document.getElementById('location-name-header'),
  alertsList: document.getElementById('alerts-list'),
  alertsCount: document.getElementById('alerts-count'),
  alertsButton: document.getElementById('alerts-button'),
  settingsButton: document.getElementById('settings-button'),
  loading: document.getElementById('loading')
};

const SYNOPTIC_API_TOKEN = '81ebbb6ea61247ac85cb88a96d97fcf2';
const SYNOPTIC_API_BASE_URL = 'https://api.synopticdata.com/v2/';
let allObservations = [], allTimestamps = [], currentStationId = null;
const pressureTendencyCodes = {
  0: "Rising, then falling",
  1: "Rising slowly",
  2: "Rising steadily",
  3: "Rising quickly",
  4: "Steady",
  5: "Falling, then rising",
  6: "Falling slowly",
  7: "Falling steadily",
  8: "Falling quickly"
};

function convertToAmericanUnits(observations, variables) {
  const converted = {}, lastNonNullValues = {}, excludedVars = [
    'air_temp_high_6_hour_set_1', 'air_temp_low_6_hour_set_1',
    'air_temp_high_24_hour_set_1', 'air_temp_low_24_hour_set_1',
    'precip_accum_one_hour_set_1', 'precip_accum_three_hour_set_1',
    'precip_accum_six_hour_set_1', 'precip_accum_24_hour_set_1'
  ];
  const unitMap = {
    temperature: ['air_temp_set_1', 'heat_index_set_1d', 'dew_point_temperature_set_1d', 'wet_bulb_temperature_set_1', 'wet_bulb_temp_set_1d'],
    wind: ['wind_speed_set_1', 'wind_gust_set_1', 'peak_wind_speed_set_1'],
    pressure: ['pressure_set_1d', 'sea_level_pressure_set_1d'],
    precip: ['precip_accum'],
    visibility: ['visibility_set_1'],
    ceiling: ['ceiling_set_1'],
    altimeter: ['altimeter_set_1'],
    wind_direction: ['wind_direction_set_1', 'peak_wind_direction_set_1'],
    percentage: ['relative_humidity_set_1'],
    text: ['weather_condition_set_1d', 'weather_summary_set_1d', 'wind_cardinal_direction_set_1d', 'pressure_tendency_set_1']
  };

  function formatPressureTendency(value) {
    const code = Math.floor(value / 1000);
    const hPaChange = (value % 1000) / 10;
    const sign = code >= 0 && code <= 3 ? '+' : (code >= 5 && code <= 8 ? '-' : '');
    return `${pressureTendencyCodes[code] || 'Unknown'}: ${sign}${hPaChange.toFixed(1)} hPa`;
  }

  variables.forEach(v => {
    if (!observations[v] || !Array.isArray(observations[v]) || observations[v].length !== allTimestamps.length) {
      if (!excludedVars.includes(v)) {
        converted[v] = Array(allTimestamps.length).fill('');
        lastNonNullValues[v] = '';
      }
      return;
    }
    let lastNonNull = null;
    converted[v] = observations[v].map((value, i) => {
      if (value !== null && value !== '' && !isNaN(parseFloat(value))) {
        lastNonNull = parseFloat(value);
        if (unitMap.temperature.includes(v)) return `${(lastNonNull * 9/5 + 32).toFixed(2)}°F`;
        if (unitMap.wind.includes(v)) return `${(lastNonNull * 2.23694).toFixed(2)}mph`;
        if (v.includes('altimeter')) return `${(lastNonNull * 0.0002953).toFixed(2)}inHg`;
        if (unitMap.pressure.includes(v)) return `${(lastNonNull * 0.01).toFixed(2)}mbar`;
        if (unitMap.precip.includes(v)) return `${(lastNonNull * 0.03937).toFixed(3)}in`;
        if (v.includes('visibility')) {
          const miles = lastNonNull;
          return miles >= 10 ? '10.0mi' : `${miles.toFixed(1)}mi`;
        }
        if (v.includes('ceiling')) return `${(lastNonNull * 3.28084).toFixed(0)}ft`;
        if (v.includes('pressure_tendency')) return formatPressureTendency(lastNonNull);
        if (unitMap.wind_direction.includes(v)) return `${lastNonNull}°`;
        if (unitMap.percentage.includes(v)) return `${lastNonNull.toFixed(2)}%`;
        return lastNonNull;
      } else if (unitMap.text.includes(v) && value) {
        lastNonNull = value;
        return value;
      }
      if (lastNonNull !== null && !isNaN(lastNonNull) && !excludedVars.includes(v)) {
        if (unitMap.temperature.includes(v)) return `${(lastNonNull * 9/5 + 32).toFixed(2)}°F`;
        if (unitMap.wind.includes(v)) return `${(lastNonNull * 2.23694).toFixed(2)}mph`;
        if (v.includes('altimeter')) return `${(lastNonNull * 0.0002953).toFixed(2)}inHg`;
        if (unitMap.pressure.includes(v)) return `${(lastNonNull * 0.01).toFixed(2)}mbar`;
        if (unitMap.precip.includes(v)) return `${(lastNonNull * 0.03937).toFixed(3)}in`;
        if (v.includes('visibility')) {
          const miles = lastNonNull;
          return miles >= 10 ? '10.0mi' : `${miles.toFixed(1)}mi`;
        }
        if (v.includes('ceiling')) return `${(lastNonNull * 3.28084).toFixed(0)}ft`;
        if (v.includes('pressure_tendency')) return formatPressureTendency(lastNonNull);
        if (unitMap.wind_direction.includes(v)) return `${lastNonNull}°`;
        if (unitMap.percentage.includes(v)) return `${lastNonNull.toFixed(2)}%`;
        return lastNonNull;
      }
      return unitMap.text.includes(v) && value ? value : '';
    });
    lastNonNullValues[v] = lastNonNull !== null ? (
      unitMap.temperature.includes(v) ? `${(lastNonNull * 9/5 + 32).toFixed(2)}°F` :
      unitMap.wind.includes(v) ? `${(lastNonNull * 2.23694).toFixed(2)}mph` :
      v.includes('altimeter') ? `${(lastNonNull * 0.0002953).toFixed(2)}inHg` :
      unitMap.pressure.includes(v) ? `${(lastNonNull * 0.01).toFixed(2)}mbar` :
      unitMap.precip.includes(v) ? `${(lastNonNull * 0.03937).toFixed(3)}in` :
      v.includes('visibility') ? (lastNonNull >= 10 ? '10.0mi' : `${lastNonNull.toFixed(1)}mi`) :
      v.includes('ceiling') ? `${(lastNonNull * 3.28084).toFixed(0)}ft` :
      v.includes('pressure_tendency') ? formatPressureTendency(lastNonNull) :
      unitMap.wind_direction.includes(v) ? `${lastNonNull}°` :
      unitMap.percentage.includes(v) ? `${lastNonNull.toFixed(2)}%` :
      unitMap.text.includes(v) ? lastNonNull : lastNonNull
    ) : (unitMap.text.includes(v) && observations[v][observations[v].length - 1] ? observations[v][observations[v].length - 1] : '');
  });
  return { converted, lastNonNullValues };
}

function updateSummaryTable(observations) {
  const excludedVars = [
    'air_temp_high_6_hour_set_1', 'air_temp_low_6_hour_set_1',
    'air_temp_high_24_hour_set_1', 'air_temp_low_24_hour_set_1',
    'precip_accum_one_hour_set_1', 'precip_accum_three_hour_set_1',
    'precip_accum_six_hour_set_1', 'precip_accum_24_hour_set_1'
  ];
  const lastValues = {};
  const labelMap = {
    'air_temp_high_6_hour_set_1': '6 Hour Temperature High: °F',
    'air_temp_low_6_hour_set_1': '6 Hour Temperature Low: °F',
    'air_temp_high_24_hour_set_1': '24 Hour Temperature High: °F',
    'air_temp_low_24_hour_set_1': '24 Hour Temperature Low: °F',
    'precip_accum_one_hour_set_1': 'One Hour Precipitation Accumulation: in',
    'precip_accum_three_hour_set_1': 'Three Hour Precipitation Accumulation: in',
    'precip_accum_six_hour_set_1': 'Six Hour Precipitation Accumulation: in',
    'precip_accum_24_hour_set_1': '24 Hour Precipitation Accumulation: in'
  };
  excludedVars.forEach(v => {
    lastValues[v] = 'N/A';
    if (observations[v] && Array.isArray(observations[v])) {
      for (let i = observations[v].length - 1; i >= 0; i--) {
        const value = observations[v][i];
        if (value !== null && value !== '' && !isNaN(parseFloat(value))) {
          const parsedValue = parseFloat(value);
          lastValues[v] = v.includes('air_temp') ? `${(parsedValue * 9/5 + 32).toFixed(2)}°F` :
                          v.includes('precip_accum') ? `${(parsedValue * 0.03937).toFixed(3)}in` : `${parsedValue.toFixed(4)}`;
          break;
        }
      }
    }
  });
  $('#summary-table-body').html(excludedVars.map(v => {
    const label = labelMap[v] || v.replace('_set_1', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const cellClass = v.includes('air_temp') ? 'font-bold text-red-500' : '';
    return `<tr><td class="border border-gray-200 p-3">${label}</td><td class="${cellClass} border border-gray-200 p-3">${lastValues[v]}</td></tr>`;
  }).join(''));
}

function displayStationData(station) {
  if (!station || !station.OBSERVATIONS) {
    $('#data-table tbody').html('');
    $('#summary-table-body').html('');
    $('#data-view-title').text(`Station: ${currentStationId || 'Unknown'} | Last Updated: N/A`);
    return;
  }
  allObservations = station.OBSERVATIONS;
  allTimestamps = (allObservations.date_time || []).slice().reverse();
  if (!allTimestamps.length) {
    $('#data-table tbody').html('');
    $('#summary-table-body').html('');
    $('#data-view-title').text(`Station: ${currentStationId || 'Unknown'} | Last Updated: N/A`);
    return;
  }
  const allVariables = Object.keys(allObservations).filter(key => key !== 'date_time');
  const excludePatterns = /cloud_layer|metar|pressure_change_code|dew_point_temperature_set_1(?!d)|air_temp_high_6_hour_set_1|air_temp_low_6_hour_set_1|air_temp_high_24_hour_set_1|air_temp_low_24_hour_set_1|precip_accum_one_hour_set_1|precip_accum_three_hour_set_1|precip_accum_six_hour_set_1|precip_accum_24_hour_set_1|sea_level_pressure_set_1$|sea_level_pressure_tendency$|weather_cond_code_set_1/;
  const variables = allVariables.filter(v => !excludePatterns.test(v));
  const sortedVariables = [
    'air_temp_set_1', 'relative_humidity_set_1', 'wind_speed_set_1', 'heat_index_set_1d', 'weather_summary_set_1d',
    'wind_cardinal_direction_set_1d', 'wind_gust_set_1', 'visibility_set_1', 'weather_condition_set_1d',
    'dew_point_temperature_set_1d', 'ceiling_set_1', 'pressure_set_1d', 'sea_level_pressure_set_1d',
    'altimeter_set_1', 'pressure_tendency_set_1', 'wet_bulb_temp_set_1d', 'wind_direction_set_1',
    'peak_wind_speed_set_1', 'peak_wind_direction_set_1'
  ].filter(v => variables.includes(v)).concat(
    variables.filter(v => ![
      'air_temp_set_1', 'relative_humidity_set_1', 'wind_speed_set_1', 'heat_index_set_1d', 'weather_summary_set_1d',
      'wind_cardinal_direction_set_1d', 'wind_gust_set_1', 'visibility_set_1', 'weather_condition_set_1d',
      'dew_point_temperature_set_1d', 'ceiling_set_1', 'pressure_set_1d', 'sea_level_pressure_set_1d',
      'altimeter_set_1', 'pressure_tendency_set_1', 'wet_bulb_temp_set_1d', 'wind_direction_set_1',
      'peak_wind_speed_set_1', 'peak_wind_direction_set_1'
    ].includes(v))
  );
  const filteredObservations = {};
  sortedVariables.forEach(v => {
    filteredObservations[v] = allObservations[v] && Array.isArray(allObservations[v]) && allObservations[v].length === allTimestamps.length
      ? allObservations[v].slice().reverse()
      : Array(allTimestamps.length).fill(null);
  });
  const { converted: convertedObservations, lastNonNullValues } = convertToAmericanUnits(filteredObservations, sortedVariables);
  $('#data-view-title').text(`Station: ${station.STID} | Last Updated: ${luxon.DateTime.now().setZone('America/Chicago').toFormat('MM/dd/yyyy HH:mm:ss')}`);
  const officialLabels = {
    'air_temp_set_1': 'Air Temperature: °F',
    'relative_humidity_set_1': 'Relative Humidity: %',
    'wind_speed_set_1': 'Wind Speed: mph',
    'heat_index_set_1d': 'Heat Index: °F',
    'weather_summary_set_1d': 'Weather Summary',
    'wind_cardinal_direction_set_1d': 'Wind Cardinal Direction',
    'wind_gust_set_1': 'Wind Gust: mph',
    'weather_condition_set_1d': 'Weather Condition',
    'dew_point_temperature_set_1d': 'Dew Point Temperature: °F',
    'visibility_set_1': 'Visibility: miles',
    'ceiling_set_1': 'Ceiling Height: ft',
    'pressure_set_1d': 'Station Pressure: mbar',
    'sea_level_pressure_set_1d': 'Sea Level Pressure: mbar',
    'altimeter_set_1': 'Altimeter Setting: inHg',
    'pressure_tendency_set_1': 'Pressure Tendency',
    'wet_bulb_temp_set_1d': 'Wet Bulb Temperature: °F',
    'wind_direction_set_1': 'Wind Direction: °',
    'peak_wind_speed_set_1': 'Peak Wind Speed: mph',
    'peak_wind_direction_set_1': 'Peak Wind Direction: °'
  };
  $('#data-table thead tr').html([
    `<th class="border border-gray-200 p-3 bg-gray-800 text-white sticky top-0 z-[110] min-w-[150px]">Date and Time</th>`,
    ...sortedVariables.map(v => {
      const label = officialLabels[v] || v.replace('_set_1', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<th class="border border-gray-200 p-3 bg-gray-800 text-white sticky top-0 z-[100]">${label}</th>`;
    })
  ].join(''));
  $('#data-table tbody').html(allTimestamps.slice(0, 72).map((time, index) => {
    const parsedTime = luxon.DateTime.fromISO(time, { zone: 'America/Chicago' }).isValid ?
      luxon.DateTime.fromISO(time, { zone: 'America/Chicago' }).toFormat('MM/dd/yyyy h:mm a') : '';
    return `<tr><td class="border border-gray-200 p-3 sticky left-0 z-[90] min-w-[150px] bg-[var(--card-bg)]">${parsedTime}</td>${sortedVariables.map(v => `<td class="border border-gray-200 p-3">${convertedObservations[v][index] || ''}</td>`).join('')}</tr>`;
  }).join(''));
  updateSummaryTable(allObservations);
  const tableContainer = document.getElementById('data-table-container');
  tableContainer.style.opacity = '0';
  tableContainer.style.display = 'none';
  setTimeout(() => {
    tableContainer.style.display = 'block';
    tableContainer.offsetHeight; // Force reflow
    tableContainer.style.opacity = '1';
  }, 10);
}

function fetchStationData(stationId, startDate, endDate) {
  if (!stationId) {
    $('#data-table tbody').html('');
    $('#summary-table-body').html('');
    $('#data-view-title').text(`Station: Unknown | Last Updated: N/A`);
    return;
  }
  const formatDate = date => luxon.DateTime.fromJSDate(date).toUTC().toFormat('yyyyMMddHHmm');
  const startFormatted = formatDate(startDate), endFormatted = formatDate(endDate);
  const url = `${SYNOPTIC_API_BASE_URL}stations/timeseries?stid=${stationId}&start=${startFormatted}&end=${endFormatted}&token=${SYNOPTIC_API_TOKEN}&obtimezone=local`;
  $.ajax({
    url: url,
    method: 'GET',
    success: function(data, status, xhr) {
      if (data.STATION && data.STATION[0] && data.STATION[0].OBSERVATIONS && data.SUMMARY.RESPONSE_CODE === 1) {
        currentStationId = data.STATION[0].STID;
        displayStationData(data.STATION[0]);
      } else {
        $('#data-table tbody').html('');
        $('#summary-table-body').html('');
        $('#data-view-title').text(`Station: ${stationId} | Last Updated: N/A`);
        elements.locationError.textContent = 'Error: API rate limit exceeded.';
        elements.locationError.classList.remove('hidden');
      }
    },
    error: function(xhr) {
      $('#data-table tbody').html('');
      $('#summary-table-body').html('');
      $('#data-view-title').text(`Station: ${stationId} | Last Updated: N/A`);
      elements.locationError.textContent = xhr.status === 429 ? 'Error: API rate limit exceeded.' : 'Error: API rate limit exceeded.';
      elements.locationError.classList.remove('hidden');
    }
  });
}

$(document).ready(() => {
  const API_KEY = '86f857c7c80b4ba3bfe3afdb9fefb393';
  const GEOCODING_API = 'https://api.opencagedata.com/geocode/v1/json';
  const NWS_API = 'https://api.weather.gov';
  let selectedLocation = null, currentLocation = null;

  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  elements.themeToggle = document.getElementById('theme-toggle');
  elements.themeToggle.checked = savedTheme === 'dark';

  const fetchWithRetry = async (url, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, { headers: { 'User-Agent': 'NWS Weather App', 'accept': 'application/geo+json' } });
        if (response.status === 429) {
          elements.locationError.textContent = 'Error: API rate limit exceeded. Please try again later.';
          elements.locationError.classList.remove('hidden');
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          continue;
        }
        if (!response.ok) throw new Error('HTTP error');
        return response;
      } catch (error) {
        if (i === retries - 1) throw new Error('Max retries reached');
      }
    }
  };

  const getCachedData = (key, ttl = 15 * 60 * 1000) => {
    const cached = JSON.parse(localStorage.getItem(key));
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    return null;
  };

  const setCachedData = (key, data) => {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  };

  const reverseGeocode = async (lat, lng) => {
    const cacheKey = `${lat}_${lng}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;
    const response = await fetchWithRetry(`${GEOCODING_API}?q=${lat}+${lng}&key=${API_KEY}&countrycode=US&limit=1`);
    const data = await response.json();
    if (!data.results.length) throw new Error('No geocoding results');
    const result = data.results[0].formatted.replace(/United States of America/, 'U.S.');
    setCachedData(cacheKey, result);
    return result;
  };

  const getHumidity = async (wfo, gridX, gridY, startTime) => {
    const cacheKey = `${wfo}_${gridX}_${gridY}`;
    let humidityData = getCachedData(cacheKey);
    if (!humidityData) {
      const response = await fetchWithRetry(`${NWS_API}/gridpoints/${wfo}/${gridX},${gridY}`);
      const json = await response.json();
      humidityData = json.properties?.relativeHumidity?.values;
      if (!humidityData) throw new Error('No humidity data');
      setCachedData(cacheKey, humidityData);
    }
    const targetTime = new Date(startTime).getTime();
    let closest = 'N/A', minDiff = Infinity;
    for (const entry of humidityData) {
      const entryTime = new Date(entry.validTime.split('/')[0]).getTime();
      const diff = Math.abs(targetTime - entryTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = entry.value;
      }
    }
    return closest !== 'N/A' ? `${closest}%` : 'N/A';
  };

  const fetchGeocoding = async (location) => {
    const cacheKey = location.toLowerCase().replace(/\s+/g, '_');
    const cached = getCachedData(cacheKey);
    if (cached) return cached;
    const response = await fetchWithRetry(`${GEOCODING_API}?q=${encodeURIComponent(location)}&key=${API_KEY}&countrycode=US&limit=5`);
    const data = await response.json();
    if (!data.results.length) throw new Error('No geocoding results');
    const result = {
      lat: data.results[0].geometry.lat,
      lng: data.results[0].geometry.lng,
      name: data.results[0].components.city || data.results[0].formatted.replace(/United States of America/, 'U.S.')
    };
    setCachedData(cacheKey, result);
    return result;
  };

  const fetchCurrentConditions = async (stationsUrl, wfo, gridX, gridY) => {
    const stationsResponse = await fetchWithRetry(stationsUrl);
    const stationsData = await stationsResponse.json();
    if (!stationsData.features?.length) throw new Error('No stations found');
    currentStationId = stationsData.features[0].properties.stationIdentifier;
    const stationId = currentStationId;
    const obsResponse = await fetchWithRetry(`${NWS_API}/stations/${stationId}/observations/latest`);
    const obsData = await obsResponse.json();
    if (!obsData.properties) throw new Error('No observation data');
    const humidity = await getHumidity(wfo, gridX, gridY, new Date().toISOString());
    return { obsData, humidity };
  };

  const fetchHourlyForecast = async (wfo, gridX, gridY) => {
    const cacheKey = `hourly_${wfo}_${gridX}_${gridY}`;
    let hourlyData = getCachedData(cacheKey);
    if (!hourlyData) {
      const response = await fetchWithRetry(`${NWS_API}/gridpoints/${wfo}/${gridX},${gridY}/forecast/hourly`);
      hourlyData = await response.json();
      if (!hourlyData.properties?.periods) throw new Error('No hourly forecast data');
      setCachedData(cacheKey, hourlyData);
    }
    return hourlyData;
  };

  const fetchSevenDayForecast = async (wfo, gridX, gridY) => {
    const cacheKey = `7day_${wfo}_${gridX}_${gridY}`;
    let forecastData = getCachedData(cacheKey);
    if (!forecastData) {
      const response = await fetchWithRetry(`${NWS_API}/gridpoints/${wfo}/${gridX},${gridY}/forecast`);
      forecastData = await response.json();
      if (!forecastData.properties?.periods) throw new Error('No 7-day forecast data');
      setCachedData(cacheKey, forecastData);
    }
    return forecastData;
  };

  const fetchAlerts = async (lat, lng) => {
    const response = await fetchWithRetry(`${NWS_API}/alerts/active?point=${lat},${lng}`);
    const data = await response.json();
    return data.features || [];
  };

  async function fetchWeather(location, lat, lng, isGeolocation = false) {
    if (!isGeolocation && !location) {
      elements.locationError.textContent = 'Error: API rate limit exceeded.';
      elements.locationError.classList.remove('hidden');
      elements.loading.classList.add('hidden');
      return;
    }
    elements.locationError.classList.add('hidden');
    elements.loading.classList.remove('hidden');
    elements.starter.classList.add('hidden');
    elements.result.classList.add('hidden');
    elements.tabs.classList.add('hidden');
    try {
      let locationName;
      if (isGeolocation) {
        locationName = location;
      } else if (selectedLocation && selectedLocation.formatted?.replace(/United States of America/, 'U.S.') === location) {
        lat = selectedLocation.geometry.lat;
        lng = selectedLocation.geometry.lng;
        locationName = selectedLocation.formatted.replace(/United States of America/, 'U.S.');
      } else {
        const geoData = await fetchGeocoding(location);
        lat = geoData.lat;
        lng = geoData.lng;
        locationName = geoData.name;
      }
      lat = Number(lat.toFixed(4));
      lng = Number(lng.toFixed(4));
      if (isNaN(lat) || isNaN(lng)) throw new Error('Invalid coordinates');
      const pointsResponse = await fetchWithRetry(`${NWS_API}/points/${lat},${lng}`);
      const pointsData = await pointsResponse.json();
      if (!pointsData.properties) throw new Error('No points data');
      const stationsUrl = pointsData.properties.observationStations;
      const wfo = pointsData.properties.gridId;
      const gridX = pointsData.properties.gridX;
      const gridY = pointsData.properties.gridY;
      const { obsData, humidity } = await fetchCurrentConditions(stationsUrl, wfo, gridX, gridY);
      const currentTempF = obsData.properties.temperature?.value != null ? `${Math.round((obsData.properties.temperature.value * 9/5) + 32)}°F` : 'N/A';
      const currentConditions = obsData.properties.textDescription || 'N/A';
      const windSpeed = obsData.properties.windSpeed?.value ? `${Math.round((obsData.properties.windSpeed.value * 0.621371))}mph` : 'N/A';
      const windDirection = obsData.properties.windDirection?.value != null ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(obsData.properties.windDirection.value / 45) % 8] : 'N/A';
      const windGust = obsData.properties.windGust?.value ? `${Math.round((obsData.properties.windGust.value * 0.621371))}mph` : 'N/A';
      const dewPointF = obsData.properties.dewpoint?.value != null ? `${Math.round((obsData.properties.dewpoint.value * 9/5) + 32)}°F` : 'N/A';
      const pressure = obsData.properties.seaLevelPressure?.value ? `${(obsData.properties.seaLevelPressure.value / 100).toFixed(2)}mbar` : 'N/A';
      const visibility = obsData.properties.visibility?.value ? (obsData.properties.visibility.value / 1609.34 >= 10 ? '10.0mi' : `${(obsData.properties.visibility.value / 1609.34).toFixed(1)}mi`) : 'N/A';
      const feelsLikeF = obsData.properties.heatIndex?.value != null ? `${Math.round((obsData.properties.heatIndex.value * 9/5) + 32)}°F` : currentTempF;
      const rainToday = obsData.properties.precipitationLast24Hours?.value ? `${(obsData.properties.precipitationLast24Hours.value * 0.0393701).toFixed(2)}in` : 'N/A';
      const lastUpdated = obsData.properties.timestamp ? new Date(obsData.properties.timestamp).toLocaleString() : 'N/A';
      const hourlyData = await fetchHourlyForecast(wfo, gridX, gridY);
      const alerts = await fetchAlerts(lat, lng);
      const forecastData = await fetchSevenDayForecast(wfo, gridX, gridY);
      const periods = forecastData.properties.periods;
      elements.header.textContent = locationName;
      currentLocation = locationName;
      elements.now.innerHTML = `
        <div class="weather-card">
          <div class="grid grid-cols-1 gap-4 text-center">
            <p class="text-6xl font-extrabold text-blue-600" style="color: var(--accent-color)">${currentTempF}</p>
            <img src="${obsData.properties.icon || `${NWS_API}/icons/land/day/skc?size=medium`}" alt="${currentConditions}" class="mx-auto w-24 h-24">
            <p class="text-xl font-semibold">${currentConditions}</p>
          </div>
          <div class="grid grid-cols-2 gap-4 mt-4">
            <div class="bg-card p-3 rounded-lg shadow">
              <p class="text-base">Feels Like: <span style="color: var(--accent-color)">${feelsLikeF}</span></p>
              <p class="text-base">Humidity: <span style="color: var(--highlight-color)">${humidity}</span></p>
              <p class="text-base">Dew Point: <span style="color: var(--accent-color)">${dewPointF}</span></p>
              <p class="text-base">Visibility: <span style="color: var(--highlight-color)">${visibility}</span></p>
            </div>
            <div class="bg-card p-3 rounded-lg shadow">
              <p class="text-base">Wind: <span style="color: var(--accent-color)">${windSpeed} ${windDirection}</span></p>
              <p class="text-base">Wind Gust: <span style="color: var(--highlight-color)">${windGust}</span></p>
              <p class="text-base">Pressure: <span style="color: var(--accent-color)">${pressure}</span></p>
              <p class="text-base">Rain Today: <span style="color: var(--highlight-color)">${rainToday}</span></p>
            </div>
          </div>
          <div class="bg-card p-3 rounded-lg shadow mt-4">
            <p class="text-base">Last Updated: <span>${lastUpdated}</span></p>
            <p class="text-sm text-gray-500" style="color: var(--text-color)">Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}</p>
          </div>
        </div>
      `;
      elements.hourly.innerHTML = '';
      const now = new Date(), twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const hourlyPeriods = hourlyData.properties.periods.filter(period => {
        const periodTime = new Date(period.startTime);
        return periodTime >= now && periodTime <= twentyFourHoursLater;
      }).slice(0, 24);
      for (const period of hourlyPeriods) {
        const timeStr = new Date(period.startTime).toLocaleTimeString([], { hour: 'numeric', hour12: true });
        const humidity = await getHumidity(wfo, gridX, gridY, period.startTime);
        const chanceOfRain = period.probabilityOfPrecipitation?.value ? `${period.probabilityOfPrecipitation.value}%` : 'N/A';
        const tempF = period.temperatureUnit === 'F' ? `${period.temperature}°F` : `${Math.round((period.temperature * 9/5) + 32)}°F`;
        const row = document.createElement('div');
        row.className = 'hour-row';
        row.innerHTML = `
          <div class="hour-cell font-medium">${timeStr}</div>
          <div class="hour-cell">${tempF}</div>
          <div class="hour-cell"><img src="${period.icon || `${NWS_API}/icons/land/day/skc?size=medium`}" alt="${period.shortForecast || 'Clear'}" class="mx-auto w-10 h-10"></div>
          <div class="hour-cell">${period.shortForecast || 'N/A'}</div>
          <div class="hour-cell">Rain: ${chanceOfRain}</div>
          <div class="hour-cell">Humidity: ${humidity}</div>
        `;
        elements.hourly.appendChild(row);
      }
      elements.sevenDay.innerHTML = '';
      let dayCount = 0, i = 0;
      while (i < periods.length && dayCount < 7) {
        const period = periods[i];
        const forecastText = period.shortForecast || 'N/A';
        const humidity = await getHumidity(wfo, gridX, gridY, period.startTime);
        const tempF = period.temperatureUnit === 'F' ? `${period.temperature}°F` : `${Math.round((period.temperature * 9/5) + 32)}°F`;
        const dayElement = document.createElement('div');
        dayElement.className = 'day-item';
        dayElement.innerHTML = `
          <p class="font-medium">${period.name}</p>
          <p>${period.isDaytime ? 'High' : 'Low'}: ${tempF}</p>
          <img src="${period.icon || `${NWS_API}/icons/land/day/skc?size=medium`}" alt="${forecastText}" class="mt-1 w-10 h-10">
          <p>${forecastText}</p>
          <p>Humidity: ${humidity}</p>
        `;
        elements.sevenDay.appendChild(dayElement);
        i++;
        if (i >= periods.length || (i % 2 === 0 && periods[i-1].isDaytime !== periods[i-2].isDaytime)) {
          dayCount++;
        }
      }
      elements.alertsCount.textContent = alerts.length;
      elements.alertsCount.classList.toggle('hidden', alerts.length === 0);
      elements.alertsButton.classList.remove('hidden');
      elements.alertsList.innerHTML = alerts.length ? alerts.map((alert, index) => `
        <div class="alert-item">
          <p class="alert-title" data-alert-index="${index}">${alert.properties.headline || alert.properties.event || 'Alert'}</p>
          <p class="alert-description" id="alert-description-${index}">${alert.properties.description || 'No description available.'}</p>
        </div>
      `).join('') : '<p class="p-2 text-gray-600">No active alerts.</p>';
      elements.loading.classList.add('hidden');
      elements.result.classList.remove('hidden');
      elements.tabs.classList.remove('hidden');
      selectedLocation = null;
    } catch (e) {
      elements.loading.classList.add('hidden');
      elements.locationError.textContent = 'Error: API rate limit exceeded.';
      elements.locationError.classList.remove('hidden');
      elements.starter.classList.remove('hidden');
      elements.result.classList.add('hidden');
      elements.tabs.classList.add('hidden');
      elements.alertsButton.classList.add('hidden');
    }
  }

  elements.locationInput.addEventListener('input', (() => {
    let timeout;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        const query = elements.locationInput.value.trim();
        if (query.length < 3) {
          elements.autocomplete.classList.add('hidden');
          elements.locationError.classList.add('hidden');
          return;
        }
        try {
          const response = await fetchWithRetry(`${GEOCODING_API}?q=${encodeURIComponent(query)}&key=${API_KEY}&countrycode=US&limit=5`);
          const data = await response.json();
          elements.autocomplete.innerHTML = '';
          if (data.results.length) {
            data.results.forEach(result => {
              const formatted = result.formatted.replace(/United States of America/, 'U.S.');
              const item = document.createElement('div');
              item.className = 'autocomplete-item';
              item.textContent = formatted;
              item.addEventListener('click', () => {
                elements.locationInput.value = formatted;
                selectedLocation = result;
                elements.autocomplete.classList.add('hidden');
                elements.locationError.classList.add('hidden');
                fetchWeather(formatted);
              });
              elements.autocomplete.appendChild(item);
            });
            elements.autocomplete.classList.remove('hidden');
          } else {
            elements.autocomplete.classList.add('hidden');
            elements.locationError.textContent = 'Error: API rate limit exceeded.';
            elements.locationError.classList.remove('hidden');
          }
        } catch (error) {
          elements.autocomplete.classList.add('hidden');
          elements.locationError.textContent = 'Error: API rate limit exceeded.';
          elements.locationError.classList.remove('hidden');
        }
      }, 300);
    };
  })());

  document.addEventListener('click', e => {
    if (!elements.locationInput.contains(e.target) && !elements.autocomplete.contains(e.target) && !elements.header.contains(e.target)) {
      elements.autocomplete.classList.add('hidden');
    }
    if (!elements.alertsButton.contains(e.target) && !elements.alerts.contains(e.target)) {
      elements.alerts.classList.remove('active');
    }
    if (!elements.settingsButton.contains(e.target) && !elements.settings.contains(e.target)) {
      elements.settings.classList.remove('active');
    }
  });

  elements.header.addEventListener('click', () => {
    if (currentLocation) {
      elements.locationInput.value = currentLocation;
      elements.starter.classList.remove('hidden');
      elements.result.classList.add('hidden');
      elements.settings.classList.remove('active');
      elements.alerts.classList.remove('active');
      elements.tabs.classList.add('hidden');
      elements.autocomplete.classList.remove('hidden');
      elements.alertsButton.classList.add('hidden');
    }
  });

  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      button.classList.add('active');
      const tabSection = document.getElementById(`${button.dataset.tab}-section`);
      tabSection?.classList.add('active');
      elements.settings.classList.remove('active');
      elements.alerts.classList.remove('active');
      if (button.dataset.tab === 'station-data' && currentStationId) {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 3 * 24 * 60 * 60 * 1000);
        fetchStationData(currentStationId, startDate, endDate);
      }
    });
  });

  const navigateBack = () => {
    elements.settings.classList.remove('active');
    elements.alerts.classList.remove('active');
    if (currentLocation) {
      elements.result.classList.remove('hidden');
      elements.tabs.classList.remove('hidden');
      elements.starter.classList.add('hidden');
    } else {
      elements.starter.classList.remove('hidden');
      elements.tabs.classList.add('hidden');
      elements.alertsButton.classList.add('hidden');
    }
  };

  elements.alertsButton.addEventListener('click', () => {
    elements.alerts.classList.toggle('active');
    elements.settings.classList.remove('active');
    elements.starter.classList.add('hidden');
    elements.result.classList.add('hidden');
    elements.tabs.classList.add('hidden');
  });

  elements.settingsButton.addEventListener('click', () => {
    elements.settings.classList.toggle('active');
    elements.alerts.classList.remove('active');
    elements.starter.classList.add('hidden');
    elements.result.classList.add('hidden');
    elements.tabs.classList.add('hidden');
  });

  document.querySelectorAll('.back-button').forEach(btn => btn.addEventListener('click', navigateBack));

  elements.themeToggle.addEventListener('change', e => {
    const theme = e.target.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  });

  elements.alertsList.addEventListener('click', e => {
    const title = e.target.closest('.alert-title');
    if (title) {
      document.getElementById(`alert-description-${title.dataset.alertIndex}`)?.classList.toggle('active');
    }
  });

  document.getElementById('auto-locate').addEventListener('click', () => {
    const geolocationMessage = document.getElementById('geolocation-message');
    geolocationMessage.classList.remove('hidden');
    elements.locationError.classList.add('hidden');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async position => {
          const { latitude, longitude } = position.coords;
          try {
            const locationName = await reverseGeocode(latitude, longitude);
            elements.locationInput.value = locationName;
            await fetchWeather(locationName, latitude, longitude, true);
            geolocationMessage.classList.add('hidden');
          } catch (error) {
            geolocationMessage.classList.add('hidden');
            elements.locationError.textContent = 'Error: API rate limit exceeded.';
            elements.locationError.classList.remove('hidden');
          }
        },
        error => {
          geolocationMessage.classList.add('hidden');
          elements.locationError.textContent = 'Location access denied.';
          elements.locationError.classList.remove('hidden');
        },
        { timeout: 10000 }
      );
    } else {
      geolocationMessage.classList.add('hidden');
      elements.locationError.textContent = 'Location access denied.';
      elements.locationError.classList.remove('hidden');
    }
  });
});
