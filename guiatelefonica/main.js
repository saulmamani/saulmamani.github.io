new Vue({
    el:"#app",
    data:{
        txtBuscar: '',
        loading: false,
        lista: []
    },
    methods: {
        listar(){
            let url = 'https://coteorbackend.herokuapp.com/api/guias?txtBuscar=' + this.txtBuscar;
            this.lista = [];

            //loading
            this.loading = true;

            axios.get(url).then(response => {
                this.lista = response.data;
                this.loading = false;
            }).catch(e => {
                console.log(e.response.data);
                this.loading = false;
            });
        }
    },
});