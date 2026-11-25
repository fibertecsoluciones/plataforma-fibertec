// ========================================
// CARGAR COMPONENTES (HEADER Y FOOTER)
// ========================================

// Función para cargar componentes HTML
async function loadComponent(elementId, componentPath) {
    try {
        const response = await fetch(componentPath);
        const html = await response.text();
        document.getElementById(elementId).innerHTML = html;
        
        // Si es el header, activar el link de la página actual
        if (componentPath.includes('header.html')) {
            setTimeout(() => {
                const currentPage = window.location.pathname.split('/').pop() || 'index.html';
                const navLinks = document.querySelectorAll('.nav-link');
                
                navLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    if (href === currentPage) {
                        link.classList.add('active');
                    }
                });
            }, 100);
        }
    } catch (error) {
        console.error('Error cargando componente:', error);
    }
}

// Cargar header y footer cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    loadComponent('header-placeholder', '/sitio/components/header.html');
    loadComponent('footer-placeholder', '/sitio/components/footer.html');
});