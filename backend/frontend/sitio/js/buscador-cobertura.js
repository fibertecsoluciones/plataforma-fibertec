// ========================================
// BUSCADOR DE COBERTURA - FIBERTEC
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    const inputColonia = document.getElementById('buscadorColonia');
    const btnBuscar = document.getElementById('btnBuscarCobertura');
    const resultadoDiv = document.getElementById('resultadoBusqueda');

    // Lista de colonias disponibles y próximas
    const colonias = {
        // Colonias activas (disponibles)
        activas: [
            'popotla',
            'san pedro mezcalapa',
            'el km40',
            'km40',
            'pajaral'
        ],
        // Colonias próximas
        proximas: [
            'filisola',
            'Pueblo Viejo',
            'la concepción',
            'concepción',
            'tacomango',
            'san martín'
        ]
    };

    // Función para normalizar texto (quitar acentos y mayúsculas)
    function normalizarTexto(texto) {
        return texto.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();
    }

    // Función para buscar colonia
    function buscarColonia() {
        const coloniaBuscada = normalizarTexto(inputColonia.value);
        
        if (!coloniaBuscada) {
            mostrarResultado('error', 'Por favor ingresa el nombre de una colonia');
            return;
        }

        // Buscar en activas
        const encontradaActiva = colonias.activas.some(c => 
            normalizarTexto(c).includes(coloniaBuscada) || 
            coloniaBuscada.includes(normalizarTexto(c))
        );

        // Buscar en próximas
        const encontradaProxima = colonias.proximas.some(c => 
            normalizarTexto(c).includes(coloniaBuscada) || 
            coloniaBuscada.includes(normalizarTexto(c))
        );

        // Mostrar resultado
        if (encontradaActiva) {
            mostrarResultado('exito', `¡Excelente! Tenemos cobertura en ${coloniaBuscada}. ¡Contrata ya!`);
            // Opcional: centrar mapa en la colonia encontrada
            centrarMapaEnColonia(coloniaBuscada);
        } else if (encontradaProxima) {
            mostrarResultado('proximo', `¡Pronto tendremos cobertura en ${coloniaBuscada}! Déjanos tus datos y te avisamos.`);
        } else {
            mostrarResultado('error', `No tenemos cobertura en ${coloniaBuscada} aún. ¿Quieres que te avisemos cuando lleguemos?`);
        }
    }

    // Función para mostrar resultado
    function mostrarResultado(tipo, mensaje) {
        resultadoDiv.className = 'resultado-busqueda';
        resultadoDiv.classList.add(tipo);
        resultadoDiv.textContent = mensaje;
        resultadoDiv.style.display = 'block';

        // Ocultar después de 5 segundos
        setTimeout(() => {
            resultadoDiv.style.display = 'none';
        }, 5000);
    }

    // Función para centrar mapa en la colonia encontrada (opcional)
    function centrarMapaEnColonia(colonia) {
        // Coordenadas de las colonias
        const coordenadas = {
            'popotla': [18.0190556, -94.3173333],
            'Pueblo Viejo': [17.898905, -94.299016],
            'san pedro mezcalapa': [17.893544, -94.309767],
            'km40': [17.937933, -94.237106],
            'pajaral': [17.889722, -94.220825],
            'filisola': [17.854458, -94.356069],
            'concepción': [17.855194, -94.349088],
            'tacomango': [17.937447, -94.315733],
            'san martín': [17.909314, -94.324285]
        };

        // Buscar la coordenada
        for (let key in coordenadas) {
            if (colonia.includes(key) || key.includes(colonia)) {
                if (window.map) {
                    window.map.flyTo(coordenadas[key], 14, {
                        duration: 2
                    });
                }
                break;
            }
        }
    }

    // Event listeners
    btnBuscar.addEventListener('click', buscarColonia);
    
    inputColonia.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            buscarColonia();
        }
    });

    // Sugerencias mientras escribe (opcional)
    inputColonia.addEventListener('input', function() {
        const valor = this.value;
        if (valor.length > 2) {
            // Aquí podrías mostrar sugerencias
        }
    });
});