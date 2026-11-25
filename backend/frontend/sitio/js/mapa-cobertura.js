// ========================================
// MAPA CON NOMBRES VISIBLES - COLORES FIBERTEC
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('mapa-real')) return;
    
    var map = L.map('mapa-real', {
        zoomControl: true,
        zoomAnimation: true,
        fadeAnimation: true
    }).setView([17.92, -94.28], 11);

    // ========================================
    // CAPA 1: SATÉLITE (se ve bien con cualquier color)
    // ========================================
    
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: 'Imágenes &copy; Google',
        maxZoom: 20
    }).addTo(map);

    // ========================================
    // CAPA 2: NOMBRES DE LUGARES (estilo claro)
    // ========================================
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: 'Nombres &copy; OpenStreetMap',
        opacity: 0.9
    }).addTo(map);

    // ========================================
    // FUNCIÓN PARA CREAR MARCADOR CON NOMBRE
    // ========================================
    
    function crearMarcadorConNombre(coords, nombre, tipo) {
        // Colores FiberTec
        const colorActivo = '#3ea682';  // Verde FiberTec
        const colorProximo = '#3188b2'; // Azul FiberTec (cambiado de amarillo)
        const colorTexto = '#ffffff';    // Blanco
        const colorFondoNombre = '#3188b2'; // Azul FiberTec para fondo
        
        const color = tipo === 'activo' ? colorActivo : colorProximo;
        const icono = tipo === 'activo' ? '📍' : '📍'; // Mismo ícono, cambia color
        
        // Marcador personalizado con colores FiberTec
        var marker = L.marker(coords, {
            icon: L.divIcon({
                html: `<div style="position: relative;">
                    <!-- Marcador circular -->
                    <div style="
                        background-color: ${color};
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        border: 3px solid white;
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-size: 18px;
                        font-weight: bold;
                    ">${icono}</div>
                    <!-- Nombre de la colonia -->
                    <div style="
                        position: absolute;
                        top: 45px;
                        left: 50%;
                        transform: translateX(-50%);
                        background: ${colorFondoNombre};
                        color: ${colorTexto};
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: 600;
                        white-space: nowrap;
                        border: 2px solid white;
                        box-shadow: 0 4px 10px rgba(0,0,0,0.2);
                        z-index: 1000;
                        letter-spacing: 0.3px;
                    ">${nombre}</div>
                </div>`,
                className: '',
                iconSize: [36, 80],
                popupAnchor: [0, -40]
            })
        });
        
        // Popup al hacer clic con colores FiberTec
        var popupContent = tipo === 'activo' 
            ? `<div style="font-family: 'Inter', sans-serif; min-width: 180px; text-align: center;">
                <h3 style="color: #3188b2; margin: 0 0 8px 0; font-size: 16px;">📍 ${nombre}</h3>
                <p style="color: #3ea682; font-weight: bold; margin: 5px 0; background: rgba(62,166,130,0.1); padding: 4px; border-radius: 12px;">✅ DISPONIBLE</p>
                <p style="margin: 8px 0; font-size: 12px; color: #5f6b7a;">Internet de alta velocidad</p>
                <a href="contacto.html" style="display: inline-block; background: linear-gradient(135deg, #3188b2, #3ea682); color: white; padding: 6px 20px; border-radius: 25px; text-decoration: none; font-size: 12px; font-weight: 600; margin-top: 5px;">Contratar</a>
            </div>`
            : `<div style="font-family: 'Inter', sans-serif; min-width: 180px; text-align: center;">
                <h3 style="color: #3188b2; margin: 0 0 8px 0; font-size: 16px;">📍 ${nombre}</h3>
                <p style="color: #3188b2; font-weight: bold; margin: 5px 0; background: rgba(49,136,178,0.1); padding: 4px; border-radius: 12px;">⏳ PRÓXIMAMENTE</p>
                <p style="margin: 8px 0; font-size: 12px; color: #5f6b7a;">Estamos trabajando para llegar</p>
                <a href="#solicitar" style="display: inline-block; background: #3188b2; color: white; padding: 6px 20px; border-radius: 25px; text-decoration: none; font-size: 12px; font-weight: 600; margin-top: 5px;">Avisarme</a>
            </div>`;
        
        marker.bindPopup(popupContent);
        return marker;
    }

    // ========================================
    // COLONIAS ACTIVAS (Verde FiberTec)
    // ========================================
    
    var coloniasActivas = [
        { coords: [18.0190556, -94.3173333], nombre: 'Popotla' },
        { coords: [17.893544, -94.309767], nombre: 'San Pedro Mezcalapa' },
        { coords: [17.937933, -94.237106], nombre: 'El KM40' },
        { coords: [17.889722, -94.220825], nombre: 'Pajaral' }
    ];
    
    coloniasActivas.forEach(function(colonia) {
        crearMarcadorConNombre(colonia.coords, colonia.nombre, 'activo').addTo(map);
    });

    // ========================================
    // PRÓXIMAS APERTURAS (Azul FiberTec)
    // ========================================
    
    var proximasColonias = [
        { coords: [17.854458, -94.356069], nombre: 'Filisola' },
        { coords: [17.898905, -94.299016], nombre: 'Pueblo Viejo' },
        { coords: [17.855194, -94.349088], nombre: 'La Concepción' },
        { coords: [17.937447, -94.315733], nombre: 'Tacomango' },
        { coords: [17.909314, -94.324285], nombre: 'San Martín' }
    ];
    
    proximasColonias.forEach(function(colonia) {
        crearMarcadorConNombre(colonia.coords, colonia.nombre, 'proximo').addTo(map);
    });

    // ========================================
    // AJUSTAR VISTA
    // ========================================
    
    var todosLosPuntos = coloniasActivas.concat(proximasColonias).map(c => c.coords);
    var group = L.featureGroup(todosLosPuntos.map(p => L.marker(p)));
    map.fitBounds(group.getBounds().pad(0.2));
    
    L.control.scale().addTo(map);
});