export namespace main {
	
	export class AppItem {
	    name: string;
	    description: string;
	    artifact_type: string;
	    build_command: string;
	    artifact_path: string;
	    run_command: string;
	
	    static createFrom(source: any = {}) {
	        return new AppItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.artifact_type = source["artifact_type"];
	        this.build_command = source["build_command"];
	        this.artifact_path = source["artifact_path"];
	        this.run_command = source["run_command"];
	    }
	}
	export class ServerStatus {
	    running: boolean;
	    port: string;
	    ips: string[];
	    urls: string[];
	
	    static createFrom(source: any = {}) {
	        return new ServerStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.port = source["port"];
	        this.ips = source["ips"];
	        this.urls = source["urls"];
	    }
	}

}

